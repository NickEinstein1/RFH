import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ExtractedMedDraft = {
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  scheduleTimes: string[];
  isPrn: boolean;
  instructions?: string;
  brand?: string;
  rxNumber?: string;
  imprint?: string;
  categoryLabel?: string;
  prescriber?: string;
  highAlert?: boolean;
  startDate?: string;
};

@Injectable()
export class OrderExtractService {
  private readonly logger = new Logger(OrderExtractService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when AI vision is explicitly enabled AND keyed. */
  hasAi(): boolean {
    const enabled =
      (this.config.get<string>('ORDER_INTAKE_AI_ENABLED') || '').toLowerCase() === 'true';
    return enabled && Boolean(this.config.get<string>('OPENAI_API_KEY')?.trim());
  }

  async extract(opts: {
    rawText?: string | null;
    dataUrl?: string | null;
    contentType?: string | null;
    allowAiExtraction?: boolean;
  }): Promise<{ drafts: ExtractedMedDraft[]; note: string }> {
    const text = (opts.rawText || '').trim();
    if (text) {
      const drafts = this.parseTextOrders(text);
      if (drafts.length) {
        return {
          drafts,
          note: 'Parsed from pasted order text (review before approve).',
        };
      }
    }

    if (opts.dataUrl && opts.allowAiExtraction && this.hasAi()) {
      try {
        const drafts = await this.extractWithOpenAi(opts.dataUrl, opts.contentType || 'image/jpeg');
        return {
          drafts,
          note: 'Extracted with AI — nurse must review every field before approve. Image was sent to the configured AI provider under facility policy.',
        };
      } catch (e) {
        this.logger.warn(`OpenAI extract failed: ${e instanceof Error ? e.message : e}`);
        return {
          drafts: [this.emptyDraft()],
          note: 'AI extraction failed — fill drafts manually, then approve.',
        };
      }
    }

    if (opts.dataUrl && opts.allowAiExtraction && !this.hasAi()) {
      return {
        drafts: [this.emptyDraft()],
        note: 'AI extraction requested but not enabled (set ORDER_INTAKE_AI_ENABLED=true and OPENAI_API_KEY). Edit drafts manually.',
      };
    }

    if (opts.dataUrl) {
      return {
        drafts: [this.emptyDraft()],
        note: 'Image stored encrypted — paste order text or edit drafts manually (AI off unless explicitly allowed).',
      };
    }

    return {
      drafts: [this.emptyDraft()],
      note: 'Add order text or upload an image, then edit drafts before approve.',
    };
  }

  private emptyDraft(): ExtractedMedDraft {
    return {
      drugName: '',
      dose: '',
      route: 'PO',
      frequency: 'Daily',
      scheduleTimes: ['08:00'],
      isPrn: false,
      instructions: '',
      startDate: new Date().toISOString().slice(0, 10),
    };
  }

  /** Lightweight local parser for typed/pasted orders (no AI required). */
  parseTextOrders(text: string): ExtractedMedDraft[] {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^[-*=]{3,}/.test(l));

    const drafts: ExtractedMedDraft[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const line of lines) {
      if (/^(patient|dob|date|rx|prescriber|pharmacy|dea|npi)\b/i.test(line)) continue;

      const isPrn = /\bprn\b/i.test(line);
      const times = [...line.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(
        (m) => `${m[1]!.padStart(2, '0')}:${m[2]}`,
      );
      const doseMatch = line.match(
        /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|mL|units?|IU|tab(?:let)?s?|cap(?:sule)?s?))\b/i,
      );
      const routeMatch = line.match(/\b(PO|PR|IM|IV|SQ|SC|SL|TOP|ODT|inh(?:ale)?d?)\b/i);
      let drug = line
        .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|mL|units?|IU|tab(?:let)?s?|cap(?:sule)?s?)\b/gi, ' ')
        .replace(/\b(PO|PR|IM|IV|SQ|SC|SL|TOP|ODT|inh(?:ale)?d?)\b/gi, ' ')
        .replace(/\b(daily|bid|tid|qid|q\d+h|prn|once|twice|every)\b/gi, ' ')
        .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, ' ')
        .replace(/[|,;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!drug || drug.length < 2) continue;
      // Keep first 4 tokens as drug name guess
      drug = drug.split(' ').slice(0, 4).join(' ');

      let frequency = 'Daily';
      if (isPrn) frequency = 'PRN';
      else if (/\bbid\b/i.test(line)) frequency = 'BID';
      else if (/\btid\b/i.test(line)) frequency = 'TID';
      else if (/\bqid\b/i.test(line)) frequency = 'QID';

      const scheduleTimes = isPrn
        ? []
        : times.length
          ? times
          : frequency === 'BID'
            ? ['08:00', '20:00']
            : frequency === 'TID'
              ? ['08:00', '14:00', '20:00']
              : ['08:00'];

      drafts.push({
        drugName: drug,
        dose: doseMatch?.[1] || '',
        route: (routeMatch?.[1] || 'PO').toUpperCase(),
        frequency,
        scheduleTimes,
        isPrn,
        instructions: isPrn ? line : undefined,
        startDate: today,
        highAlert: /\b(insulin|warfarin|heparin|morphine|oxycodone|fentanyl)\b/i.test(line),
      });
    }

    return drafts;
  }

  private async extractWithOpenAi(
    dataUrl: string,
    contentType: string,
  ): Promise<ExtractedMedDraft[]> {
    const key = this.config.get<string>('OPENAI_API_KEY')!.trim();
    const model = this.config.get<string>('ORDER_INTAKE_MODEL') || 'gpt-4o-mini';
    const today = new Date().toISOString().slice(0, 10);

    const prompt = `Extract medication orders from this doctor/pharmacy order image or PDF page.
Return ONLY a JSON array of objects with keys:
drugName, dose, route, frequency, scheduleTimes (HH:MM array, empty if PRN), isPrn (boolean),
instructions, brand, rxNumber, imprint, categoryLabel, prescriber, highAlert (boolean), startDate (YYYY-MM-DD, default ${today}).
If unsure, leave fields empty strings rather than inventing.`;

    const isPdf = contentType.includes('pdf') || dataUrl.startsWith('data:application/pdf');
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    if (isPdf) {
      // Vision models expect images; for PDF send as text note + skip if not image
      content.push({
        type: 'text',
        text: 'Document is PDF; if you cannot read it, return [].',
      });
    } else {
      content.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content || '[]';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as ExtractedMedDraft[];
    return Array.isArray(parsed) ? parsed.map((d) => this.normalizeDraft(d, today)) : [];
  }

  private normalizeDraft(d: Partial<ExtractedMedDraft>, today: string): ExtractedMedDraft {
    return {
      drugName: String(d.drugName || '').trim(),
      dose: String(d.dose || '').trim(),
      route: String(d.route || 'PO').trim() || 'PO',
      frequency: String(d.frequency || 'Daily').trim() || 'Daily',
      scheduleTimes: Array.isArray(d.scheduleTimes)
        ? d.scheduleTimes.map(String).filter(Boolean)
        : [],
      isPrn: Boolean(d.isPrn),
      instructions: d.instructions ? String(d.instructions) : undefined,
      brand: d.brand ? String(d.brand) : undefined,
      rxNumber: d.rxNumber ? String(d.rxNumber) : undefined,
      imprint: d.imprint ? String(d.imprint) : undefined,
      categoryLabel: d.categoryLabel ? String(d.categoryLabel) : undefined,
      prescriber: d.prescriber ? String(d.prescriber) : undefined,
      highAlert: Boolean(d.highAlert),
      startDate: d.startDate ? String(d.startDate).slice(0, 10) : today,
    };
  }
}
