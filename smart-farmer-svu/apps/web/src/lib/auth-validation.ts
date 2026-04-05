export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  role: string;
  full_name: string;
  city: string;
  state: string;
  district: string;
  pincode: string;
};

export type PasswordResetPayload = {
  password: string;
  confirm_password: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\d{6}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{4,24}$/;
const PINCODE_RE = /^\d{6}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeHumanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

export function normalizeOtp(value: string): string {
  return value.replace(/\D+/g, '').slice(0, 6);
}

export function normalizePincode(value: string): string {
  return value.replace(/\D+/g, '').slice(0, 6);
}

export function validateEmailAddress(email: string): string | null {
  if (!email) {
    return 'Enter your email address.';
  }
  if (!EMAIL_RE.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePasswordStrength(password: string): string | null {
  if (!password) {
    return 'Enter your password.';
  }
  if (password.length < 8) {
    return 'Use at least 8 characters for the password.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use at least one letter and one number in the password.';
  }
  return null;
}

export function validateLoginPayload(payload: LoginPayload): string | null {
  return validateEmailAddress(payload.email) || validatePasswordStrength(payload.password);
}

export function validateOtpCode(otp: string): string | null {
  if (!otp) {
    return 'Enter the 6-digit OTP to continue.';
  }
  if (!OTP_RE.test(otp)) {
    return 'OTP must contain exactly 6 digits.';
  }
  return null;
}

export function validateRegisterPayload(payload: RegisterPayload): string | null {
  if (!payload.full_name || payload.full_name.length < 3) {
    return 'Enter the full name as shown on the account.';
  }
  const emailError = validateEmailAddress(payload.email);
  if (emailError) {
    return emailError;
  }
  if (!payload.role || !['customer', 'farmer'].includes(payload.role)) {
    return 'Choose how you are joining Smart Farmer.';
  }
  if (!payload.city || payload.city.length < 2) {
    return 'Enter your city to continue.';
  }
  if (!USERNAME_RE.test(payload.username)) {
    return 'Username must be 4 to 24 characters and may use letters, numbers, dots, dashes, or underscores.';
  }
  const passwordError = validatePasswordStrength(payload.password);
  if (passwordError) {
    return passwordError;
  }
  if (payload.pincode && !PINCODE_RE.test(payload.pincode)) {
    return 'Pincode must contain exactly 6 digits.';
  }
  return null;
}

export function validatePasswordResetPayload(payload: PasswordResetPayload): string | null {
  const passwordError = validatePasswordStrength(payload.password);
  if (passwordError) {
    return passwordError;
  }
  if (!payload.confirm_password) {
    return 'Confirm the new password to continue.';
  }
  if (payload.password !== payload.confirm_password) {
    return 'New password and confirmation password must match.';
  }
  return null;
}
