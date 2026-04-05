import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import {
  clearAdminAuth,
  clearAuth,
  clearPreAuth,
  clearResetAuth,
  getSessionState,
  persistAuth,
  setAdminAuth,
  setPreAuth,
  setResetAuth,
  type SessionUser,
} from "@/lib/auth";
import { COOKIE_NAMES } from "@/lib/cookies";
import { redirect, redirectWithFlash } from "@/lib/http";
import {
  normalizeEmail,
  normalizeHumanName,
  normalizeOtp,
  normalizePincode,
  normalizeUsername,
  validateEmailAddress,
  validateLoginPayload,
  validateOtpCode,
  validatePasswordResetPayload,
  validateRegisterPayload,
} from "@/lib/auth-validation";
import { normalizeLanguage } from "@/lib/language";
import { renderTemplate } from "@/lib/template";

import { getString, jsonResponse } from "@/server/utils";

function applyPreferredLanguage(response: NextResponse, user?: SessionUser | null): void {
  if (!user?.preferred_language || !user.preferred_language.trim()) {
    return;
  }
  const preferredLanguage = normalizeLanguage(user.preferred_language);
  response.cookies.set(COOKIE_NAMES.lang, preferredLanguage, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function loginPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (session.user) {
    return redirect(request, "/");
  }
  return renderTemplate(request, "auth.html", { mode: "login", form_action: "/login" }, "login");
}

export async function loginAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const email = normalizeEmail(getString(formData, "email"));
  const password = getString(formData, "password");
  const loginValidationError = validateLoginPayload({ email, password });
  if (loginValidationError) {
    return redirectWithFlash(request, "/login", "error", loginValidationError);
  }
  const { response, data } = await apiFetch("/api/auth/login/", {
    method: "POST",
    body: {
      email,
      password,
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/login", "error", String(data.message || "Invalid email or password"));
  }
  const next = redirect(request, "/verify");
  setPreAuth(next, {
    challengeId: String(data.challenge_id),
    email: String(data.email || email),
    purpose: String(data.purpose || "login"),
  });
  return next;
}

export async function verifyPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.preAuth) {
    return redirectWithFlash(request, "/login", "error", "Please login first");
  }
  return renderTemplate(
    request,
    "auth.html",
    {
      mode: "verify",
      email: session.preAuth.email,
      form_action: "/verify",
    },
    "verify",
  );
}

export async function requestOtpAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.preAuth) {
    return jsonResponse(
      { success: false, message: "Start from login before requesting an OTP.", error_code: "login_required", otp: null },
      400,
    );
  }
  const { response, data } = await apiFetch("/api/auth/request-otp/", {
    method: "POST",
    body: {
      challenge_id: session.preAuth.challengeId,
      email: session.preAuth.email,
      purpose: session.preAuth.purpose,
    },
  });
  return jsonResponse(data, response.status);
}

export async function verifyAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.preAuth) {
    return jsonResponse({ success: false, message: "Please login first", error_code: "login_required" }, 400);
  }
  const formData = await request.formData();
  const otp = normalizeOtp(getString(formData, "otp"));
  const otpValidationError = validateOtpCode(otp);
  if (otpValidationError) {
    if (getString(formData, "response_mode") === "json") {
      return jsonResponse({ success: false, message: otpValidationError, error_code: "invalid_otp_format" }, 400);
    }
    return redirectWithFlash(request, "/verify", "error", otpValidationError);
  }
  const { response, data } = await apiFetch("/api/auth/verify-otp/", {
    method: "POST",
    body: {
      challenge_id: session.preAuth.challengeId,
      email: session.preAuth.email,
      otp,
      purpose: session.preAuth.purpose,
    },
  });
  if (getString(formData, "response_mode") === "json") {
    const next = jsonResponse(data, response.status);
    if (response.ok && data.success && data.token && data.user) {
      persistAuth(next, String(data.token), data.user as SessionUser);
      applyPreferredLanguage(next, data.user as SessionUser);
      clearPreAuth(next);
      clearResetAuth(next);
      clearAdminAuth(next);
    }
    return next;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/verify", "error", String(data.message || "Incorrect OTP"));
  }
  const next = redirect(request, String(data.redirect || "/"));
  persistAuth(next, String(data.token), data.user as SessionUser);
  applyPreferredLanguage(next, data.user as SessionUser);
  clearPreAuth(next);
  clearResetAuth(next);
  clearAdminAuth(next);
  return next;
}

export async function registerPage(request: NextRequest): Promise<NextResponse> {
  return renderTemplate(request, "auth.html", { mode: "register", form_action: "/register" }, "register");
}

export async function registerAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const registerPayload = {
    username: normalizeUsername(getString(formData, "username")),
    email: normalizeEmail(getString(formData, "email")),
    password: getString(formData, "password"),
    role: getString(formData, "role") || "customer",
    full_name: normalizeHumanName(getString(formData, "full_name")),
    city: normalizeHumanName(getString(formData, "city")),
    state: normalizeHumanName(getString(formData, "state")),
    district: normalizeHumanName(getString(formData, "district")),
    pincode: normalizePincode(getString(formData, "pincode")),
  };
  const registerValidationError = validateRegisterPayload(registerPayload);
  if (registerValidationError) {
    return redirectWithFlash(request, "/register", "error", registerValidationError);
  }
  const { response, data } = await apiFetch("/api/auth/register/", {
    method: "POST",
    body: registerPayload,
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/register", "error", String(data.message || "Registration failed"));
  }
  return redirectWithFlash(request, "/login", "success", String(data.message || "Registration successful! Please login."));
}

export async function forgotPasswordPage(request: NextRequest): Promise<NextResponse> {
  return renderTemplate(request, "auth.html", { mode: "forgot_password", form_action: "/forgot_password" }, "forgot_password");
}

export async function forgotPasswordAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const email = normalizeEmail(getString(formData, "email"));
  const emailValidationError = validateEmailAddress(email);
  if (emailValidationError) {
    return redirectWithFlash(request, "/forgot_password", "error", emailValidationError);
  }
  const { response, data } = await apiFetch("/api/auth/forgot-password/", {
    method: "POST",
    body: {
      email,
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/forgot_password", "error", String(data.message || "Unable to start password reset"));
  }
  const next = redirect(request, "/reset_password/verify");
  setResetAuth(next, {
    challengeId: String(data.challenge_id),
    email: String(data.email || email),
    purpose: String(data.purpose || "password_reset"),
    verified: false,
  });
  return next;
}

export async function requestPasswordResetOtpAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return jsonResponse(
      { success: false, message: "Start the password reset flow before requesting a new OTP.", error_code: "password_reset_required", otp: null },
      400,
    );
  }
  const { response, data } = await apiFetch("/api/auth/request-otp/", {
    method: "POST",
    body: {
      challenge_id: session.resetAuth.challengeId,
      email: session.resetAuth.email,
      purpose: session.resetAuth.purpose,
    },
  });
  return jsonResponse(data, response.status);
}

export async function resetVerifyPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return redirectWithFlash(request, "/forgot_password", "error", "Start the password reset flow before requesting a new OTP.");
  }
  return renderTemplate(
    request,
    "auth.html",
    { mode: "reset_verify", email: session.resetAuth.email, form_action: "/reset_password/verify" },
    "verify_reset_otp",
  );
}

export async function resetVerifyAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return jsonResponse({ success: false, message: "Start the password reset flow first.", error_code: "password_reset_required" }, 400);
  }
  const formData = await request.formData();
  const otp = normalizeOtp(getString(formData, "otp"));
  const otpValidationError = validateOtpCode(otp);
  if (otpValidationError) {
    if (getString(formData, "response_mode") === "json") {
      return jsonResponse({ success: false, message: otpValidationError, error_code: "invalid_otp_format" }, 400);
    }
    return redirectWithFlash(request, "/reset_password/verify", "error", otpValidationError);
  }
  const { response, data } = await apiFetch("/api/auth/verify-otp/", {
    method: "POST",
    body: {
      challenge_id: session.resetAuth.challengeId,
      email: session.resetAuth.email,
      otp,
      purpose: session.resetAuth.purpose,
    },
  });
  if (getString(formData, "response_mode") === "json") {
    const payload = response.ok && data.success ? { ...data, redirect: String(data.redirect || "/reset_password") } : data;
    const next = jsonResponse(payload, response.status);
    if (response.ok && data.success) {
      setResetAuth(next, { ...session.resetAuth, verified: true });
    }
    return next;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/reset_password/verify", "error", String(data.message || "Incorrect OTP"));
  }
  const next = redirect(request, "/reset_password");
  setResetAuth(next, { ...session.resetAuth, verified: true });
  return next;
}

export async function resetPasswordPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth) {
    return redirectWithFlash(request, "/forgot_password", "error", "Start the password reset flow before requesting a new OTP.");
  }
  if (!session.resetAuth.verified) {
    return redirectWithFlash(request, "/reset_password/verify", "error", "Complete OTP verification before setting a new password.");
  }
  return renderTemplate(
    request,
    "auth.html",
    { mode: "reset_password", email: session.resetAuth.email, form_action: "/reset_password" },
    "reset_password",
  );
}

export async function resetPasswordAction(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (!session.resetAuth || !session.resetAuth.verified) {
    return redirectWithFlash(request, "/forgot_password", "error", "Complete OTP verification before setting a new password.");
  }
  const formData = await request.formData();
  const passwordResetPayload = {
    password: getString(formData, "password"),
    confirm_password: getString(formData, "confirm_password"),
  };
  const passwordResetValidationError = validatePasswordResetPayload(passwordResetPayload);
  if (passwordResetValidationError) {
    return redirectWithFlash(request, "/reset_password", "error", passwordResetValidationError);
  }
  const { response, data } = await apiFetch("/api/auth/reset-password/", {
    method: "POST",
    body: {
      challenge_id: session.resetAuth.challengeId,
      ...passwordResetPayload,
    },
  });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/reset_password", "error", String(data.message || "Unable to reset password"));
  }
  const next = redirectWithFlash(request, "/login", "success", String(data.message || "Password updated successfully."));
  clearResetAuth(next);
  return next;
}

export async function logoutAction(request: NextRequest): Promise<NextResponse> {
  const next = redirect(request, "/");
  clearAuth(next);
  return next;
}

export async function adminLoginPage(request: NextRequest): Promise<NextResponse> {
  const session = getSessionState(request);
  if (session.user?.role === "admin") {
    return redirect(request, "/admin/dashboard");
  }
  return renderTemplate(request, "admin_login.html", {}, "admin_login");
}

export async function adminLoginAction(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const action = getString(formData, "action");

  if (action === "send_otp") {
    const { response, data } = await apiFetch("/api/auth/admin/login/", {
      method: "POST",
      body: {
        email: getString(formData, "email"),
        password: getString(formData, "password"),
      },
    });
    const next = jsonResponse(data, response.status);
    if (response.ok && data.success) {
      setAdminAuth(next, {
        challengeId: String(data.challenge_id),
        email: String(data.email || email),
        purpose: String(data.purpose || "admin"),
      });
    }
    return next;
  }

  if (action === "verify") {
    const session = getSessionState(request);
    if (!session.adminAuth) {
      return jsonResponse({ success: false, message: "Validate admin credentials first.", error_code: "admin_pre_auth_required", otp: null }, 400);
    }
    const { response, data } = await apiFetch("/api/auth/verify-otp/", {
      method: "POST",
      body: {
        challenge_id: session.adminAuth.challengeId,
        email: getString(formData, "email"),
        otp: getString(formData, "otp"),
        purpose: "admin",
      },
    });
    const next = jsonResponse(data, response.status);
    if (response.ok && data.success && data.token && data.user) {
      persistAuth(next, String(data.token), data.user as SessionUser);
      applyPreferredLanguage(next, data.user as SessionUser);
      clearAdminAuth(next);
    }
    return next;
  }

  return jsonResponse({ success: false, message: "Unsupported admin action.", error_code: "invalid_action", otp: null }, 400);
}
