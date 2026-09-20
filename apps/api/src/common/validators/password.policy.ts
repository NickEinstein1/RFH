import { Matches, MinLength, MaxLength } from 'class-validator';

/** HIPAA-oriented password: length + complexity (no dictionary check). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
export const PASSWORD_MESSAGE =
  'Password must be 12–128 characters and include upper, lower, number, and symbol';

export function IsStrongPassword() {
  return function (target: object, propertyKey: string) {
    MinLength(PASSWORD_MIN, { message: PASSWORD_MESSAGE })(target, propertyKey);
    MaxLength(PASSWORD_MAX, { message: PASSWORD_MESSAGE })(target, propertyKey);
    Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })(target, propertyKey);
  };
}

export function assertStrongPassword(password: string) {
  if (
    password.length < PASSWORD_MIN ||
    password.length > PASSWORD_MAX ||
    !PASSWORD_PATTERN.test(password)
  ) {
    throw new Error(PASSWORD_MESSAGE);
  }
}
