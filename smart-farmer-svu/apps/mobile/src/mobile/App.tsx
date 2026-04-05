import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Image, ImageBackground, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { resolveApiUrl } from "../config/runtime";

type RootScreen = "splash" | "loading" | "auth" | "app";
type AuthScreen = "login" | "verify" | "register" | "forgot" | "resetVerify" | "resetPassword";
type AppScreen = "dashboard" | "marketplace" | "orders" | "profile";
type LanguageCode = "en" | "te" | "hi" | "ta" | "kn" | "ml";
type Purpose = "login" | "password_reset";
type Challenge = { challengeId: string; email: string; purpose: Purpose; verified?: boolean };
type User = { id: string; username: string; email: string; role: string; full_name: string; city: string; state: string; district: string; pincode: string; is_verified: boolean };
type ApiResult = { ok: boolean; message: string; payload: Record<string, unknown> };

const API_URL = resolveApiUrl().replace(/\/$/, "");
const colors = { bg: "#F7F5EE", card: "#FFFFFF", green: "#1F6A3A", dark: "#174F2D", soft: "#E7F3E6", text: "#1E271F", muted: "#6D776E", border: "#E3E9E0", red: "#E23F32", amber: "#C07E12" };
const splashLightBackground = require("../../assets/splash-light.jpeg");
const splashDarkBackground = require("../../assets/splash-dark.jpeg");
const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "EN" },
  { code: "te", label: "TE" },
  { code: "hi", label: "HI" },
  { code: "ta", label: "TA" },
  { code: "kn", label: "KN" },
  { code: "ml", label: "ML" },
];
const MOBILE_COPY: Record<LanguageCode, Record<string, string>> = {
  en: {
    brand_tagline: "Soil to table network",
    auth_hero_title: "Smart Farmer Access",
    auth_hero_body: "Mobile now follows the same login, OTP verify, register, and reset-password flow as the web app.",
    language_label: "Language",
    login_title: "Login",
    verify_title: "Verify OTP",
    register_title: "Register",
    forgot_title: "Forgot Password",
    reset_verify_title: "Verify Reset OTP",
    reset_password_title: "Reset Password",
    email: "Email",
    password: "Password",
    username: "Username",
    full_name: "Full Name",
    role: "Role",
    city: "City",
    state: "State",
    district: "District",
    pincode: "Pincode",
    registered_email: "Registered Email",
    otp: "OTP",
    new_password: "New Password",
    confirm_password: "Confirm Password",
    continue_to_otp: "Continue to OTP",
    verify_and_login: "Verify and Login",
    resend_otp: "Resend OTP",
    back_to_login: "Back to login",
    create_account: "Create Account",
    already_account: "Already have an account?",
    forgot_password: "Forgot password?",
    no_account: "Don't have an account?",
    sign_up: "Sign Up",
    login_link: "Login",
    start_reset_flow: "Start Reset Flow",
    confirm_otp: "Confirm OTP",
    update_password: "Update Password",
    customer: "Customer",
    farmer: "Farmer",
    placeholder_email: "name@example.com",
    placeholder_password: "Enter password",
    placeholder_otp: "6 digit code",
    placeholder_username: "username",
    placeholder_full_name: "Full name",
    placeholder_password_min: "Minimum 8 characters",
    placeholder_city: "City",
    placeholder_state: "State",
    placeholder_district: "District",
    placeholder_pincode: "Pincode",
    placeholder_new_password: "New password",
    placeholder_confirm_password: "Confirm password",
  },
  te: {
    brand_tagline: "పొలం నుంచి భోజన పట్టిక వరకు",
    auth_hero_title: "స్మార్ట్ ఫార్మర్ ప్రవేశం",
    auth_hero_body: "మొబైల్ యాప్ ఇప్పుడు వెబ్ యాప్‌లాగే లాగిన్, OTP నిర్ధారణ, రిజిస్టర్ మరియు పాస్‌వర్డ్ రీసెట్ ప్రవాహాన్ని అనుసరిస్తుంది.",
    language_label: "భాష",
    login_title: "లాగిన్",
    verify_title: "OTP నిర్ధారించండి",
    register_title: "నమోదు",
    forgot_title: "పాస్‌వర్డ్ మర్చిపోయారా",
    reset_verify_title: "రీసెట్ OTP నిర్ధారించండి",
    reset_password_title: "పాస్‌వర్డ్ రీసెట్ చేయండి",
    email: "ఇమెయిల్",
    password: "పాస్‌వర్డ్",
    username: "యూజర్ పేరు",
    full_name: "పూర్తి పేరు",
    role: "పాత్ర",
    city: "నగరం",
    state: "రాష్ట్రం",
    district: "జిల్లా",
    pincode: "పిన్ కోడ్",
    registered_email: "నమోదైన ఇమెయిల్",
    otp: "OTP",
    new_password: "కొత్త పాస్‌వర్డ్",
    confirm_password: "పాస్‌వర్డ్ నిర్ధారించండి",
    continue_to_otp: "OTPకి కొనసాగండి",
    verify_and_login: "నిర్ధారించి లాగిన్ అవ్వండి",
    resend_otp: "OTP మళ్లీ పంపండి",
    back_to_login: "లాగిన్‌కి తిరిగి వెళ్ళండి",
    create_account: "ఖాతా సృష్టించండి",
    already_account: "ఇప్పటికే ఖాతా ఉందా?",
    forgot_password: "పాస్‌వర్డ్ మర్చిపోయారా?",
    no_account: "ఖాతా లేదా?",
    sign_up: "సైన్ అప్",
    login_link: "లాగిన్",
    start_reset_flow: "రీసెట్ ప్రక్రియ ప్రారంభించండి",
    confirm_otp: "OTP నిర్ధారించండి",
    update_password: "పాస్‌వర్డ్ నవీకరించండి",
    customer: "కస్టమర్",
    farmer: "రైతు",
    placeholder_email: "name@example.com",
    placeholder_password: "పాస్‌వర్డ్ నమోదు చేయండి",
    placeholder_otp: "6 అంకెల కోడ్",
    placeholder_username: "username",
    placeholder_full_name: "పూర్తి పేరు",
    placeholder_password_min: "కనీసం 8 అక్షరాలు",
    placeholder_city: "నగరం",
    placeholder_state: "రాష్ట్రం",
    placeholder_district: "జిల్లా",
    placeholder_pincode: "పిన్ కోడ్",
    placeholder_new_password: "కొత్త పాస్‌వర్డ్",
    placeholder_confirm_password: "పాస్‌వర్డ్ మళ్లీ నమోదు చేయండి",
  },
  hi: {
    brand_tagline: "खेत से थाली तक नेटवर्क",
    auth_hero_title: "स्मार्ट फार्मर एक्सेस",
    auth_hero_body: "मोबाइल अब वेब ऐप की तरह लॉगिन, OTP सत्यापन, रजिस्टर और पासवर्ड रीसेट फ्लो का पालन करता है।",
    language_label: "भाषा",
    login_title: "लॉगिन",
    verify_title: "OTP सत्यापित करें",
    register_title: "रजिस्टर",
    forgot_title: "पासवर्ड भूल गए",
    reset_verify_title: "रीसेट OTP सत्यापित करें",
    reset_password_title: "पासवर्ड रीसेट करें",
    email: "ईमेल",
    password: "पासवर्ड",
    username: "यूज़रनेम",
    full_name: "पूरा नाम",
    role: "भूमिका",
    city: "शहर",
    state: "राज्य",
    district: "जिला",
    pincode: "पिनकोड",
    registered_email: "पंजीकृत ईमेल",
    otp: "OTP",
    new_password: "नया पासवर्ड",
    confirm_password: "पासवर्ड की पुष्टि करें",
    continue_to_otp: "OTP पर जारी रखें",
    verify_and_login: "सत्यापित करें और लॉगिन करें",
    resend_otp: "OTP फिर भेजें",
    back_to_login: "लॉगिन पर वापस जाएं",
    create_account: "खाता बनाएं",
    already_account: "क्या आपके पास पहले से खाता है?",
    forgot_password: "पासवर्ड भूल गए?",
    no_account: "क्या आपके पास खाता नहीं है?",
    sign_up: "साइन अप",
    login_link: "लॉगिन",
    start_reset_flow: "रीसेट फ्लो शुरू करें",
    confirm_otp: "OTP की पुष्टि करें",
    update_password: "पासवर्ड अपडेट करें",
    customer: "ग्राहक",
    farmer: "किसान",
    placeholder_email: "name@example.com",
    placeholder_password: "पासवर्ड दर्ज करें",
    placeholder_otp: "6 अंकों का कोड",
    placeholder_username: "username",
    placeholder_full_name: "पूरा नाम",
    placeholder_password_min: "कम से कम 8 अक्षर",
    placeholder_city: "शहर",
    placeholder_state: "राज्य",
    placeholder_district: "जिला",
    placeholder_pincode: "पिनकोड",
    placeholder_new_password: "नया पासवर्ड",
    placeholder_confirm_password: "पासवर्ड फिर दर्ज करें",
  },
  ta: {},
  kn: {},
  ml: {},
};
function t(language: LanguageCode, key: string): string {
  return MOBILE_COPY[language][key] || MOBILE_COPY.en[key] || key;
}
const crops = [
  { id: "tomatoes", name: "Tomatoes", price: "Rs 45 / kg", priceValue: 45, unit: "kg", location: "Guntur", verified: true, organic: true },
  { id: "spinach", name: "Spinach", price: "Rs 32 / bunch", priceValue: 32, unit: "bunch", location: "Nellore", verified: false, organic: true },
  { id: "wheat", name: "Wheat", price: "Rs 652 / 30kg", priceValue: 652, unit: "30kg", location: "Karnal", verified: true, organic: false },
];

export default function App(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const [root, setRoot] = useState<RootScreen>("splash");
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [authScreen, setAuthScreen] = useState<AuthScreen>("login");
  const [appScreen, setAppScreen] = useState<AppScreen>("dashboard");
  const [user, setUser] = useState<User | null>(null);
  const [preAuth, setPreAuth] = useState<Challenge | null>(null);
  const [resetAuth, setResetAuth] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testOtp, setTestOtp] = useState("");
  const [search, setSearch] = useState("");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [verify, setVerify] = useState({ email: "", otp: "" });
  const [forgot, setForgot] = useState({ email: "" });
  const [resetVerify, setResetVerify] = useState({ email: "", otp: "" });
  const [resetPassword, setResetPassword] = useState({ password: "", confirm_password: "" });
  const [register, setRegister] = useState({ username: "", email: "", password: "", full_name: "", city: "", state: "", district: "", pincode: "", role: "customer" });

  useEffect(() => {
    const splashTimer = setTimeout(() => setRoot("loading"), 2200);
    const authTimer = setTimeout(() => setRoot("auth"), 3800);
    return () => {
      clearTimeout(splashTimer);
      clearTimeout(authTimer);
    };
  }, []);

  const visibleCrops = useMemo(() => crops.filter((crop) => crop.name.toLowerCase().includes(search.toLowerCase())), [search]);

  const resetNotices = () => {
    setNotice("");
    setError("");
    setTestOtp("");
  };

  const runBusy = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } finally {
      setBusy("");
    }
  };

  const requestOtp = async (challenge: Challenge) => {
    const result = await apiRequest("/api/auth/request-otp/", { challenge_id: challenge.challengeId, email: challenge.email, purpose: challenge.purpose });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const otp = text(result.payload.otp);
    setTestOtp(otp);
    setNotice(otp ? `OTP sent. Test code: ${otp}` : result.message);
  };

  const startChallenge = async (challenge: Challenge, screen: AuthScreen) => {
    resetNotices();
    if (screen === "verify") {
      setPreAuth(challenge);
      setVerify({ email: challenge.email, otp: "" });
    } else {
      setResetAuth({ ...challenge, verified: false });
      setResetVerify({ email: challenge.email, otp: "" });
    }
    setAuthScreen(screen);
    await requestOtp(challenge);
  };

  const submitLogin = async () => runBusy("Checking credentials...", async () => {
    resetNotices();
    const result = await apiRequest("/api/auth/login/", login);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await startChallenge({ challengeId: text(result.payload.challenge_id), email: text(result.payload.email) || login.email.trim().toLowerCase(), purpose: "login" }, "verify");
  });

  const submitVerify = async () => runBusy("Verifying OTP...", async () => {
    if (!preAuth) {
      setError("Please login first.");
      setAuthScreen("login");
      return;
    }
    resetNotices();
    const result = await apiRequest("/api/auth/verify-otp/", { challenge_id: preAuth.challengeId, email: verify.email, otp: verify.otp, purpose: preAuth.purpose });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const nextUser = asUser(result.payload.user);
    if (!nextUser) {
      setError("Login completed but no user was returned.");
      return;
    }
    setUser(nextUser);
    setPreAuth(null);
    setRoot("app");
  });

  const submitRegister = async () => runBusy("Creating account...", async () => {
    resetNotices();
    const result = await apiRequest("/api/auth/register/", register);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setLogin((current) => ({ ...current, email: register.email }));
    setRegister({ username: "", email: "", password: "", full_name: "", city: "", state: "", district: "", pincode: "", role: "customer" });
    setNotice(result.message);
    setAuthScreen("login");
  });

  const submitForgot = async () => runBusy("Starting reset...", async () => {
    resetNotices();
    const result = await apiRequest("/api/auth/forgot-password/", forgot);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await startChallenge({ challengeId: text(result.payload.challenge_id), email: text(result.payload.email) || forgot.email.trim().toLowerCase(), purpose: "password_reset" }, "resetVerify");
  });

  const submitResetVerify = async () => runBusy("Verifying reset OTP...", async () => {
    if (!resetAuth) {
      setError("Start the password reset flow first.");
      setAuthScreen("forgot");
      return;
    }
    resetNotices();
    const result = await apiRequest("/api/auth/verify-otp/", { challenge_id: resetAuth.challengeId, email: resetVerify.email, otp: resetVerify.otp, purpose: resetAuth.purpose });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setResetAuth({ ...resetAuth, verified: true });
    setNotice(result.message);
    setAuthScreen("resetPassword");
  });

  const submitResetPassword = async () => runBusy("Updating password...", async () => {
    if (!resetAuth?.verified) {
      setError("Complete OTP verification first.");
      setAuthScreen("resetVerify");
      return;
    }
    resetNotices();
    const result = await apiRequest("/api/auth/reset-password/", { challenge_id: resetAuth.challengeId, password: resetPassword.password, confirm_password: resetPassword.confirm_password });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setResetAuth(null);
    setResetPassword({ password: "", confirm_password: "" });
    setNotice(result.message);
    setAuthScreen("login");
  });

  const logout = () => {
    setUser(null);
    setRoot("auth");
    setAuthScreen("login");
    setNotice("You have been logged out.");
    setError("");
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        {root === "splash" ? <Splash darkMode={colorScheme === "dark"} /> : null}
        {root === "loading" ? <LoadingScreen darkMode={colorScheme === "dark"} /> : null}
        {root === "auth" ? <AuthLayout authScreen={authScreen} busy={busy} error={error} forgot={forgot} language={language} login={login} notice={notice} register={register} resetPassword={resetPassword} resetVerify={resetVerify} setAuthScreen={(next) => { resetNotices(); setAuthScreen(next); }} setForgot={setForgot} setLanguage={setLanguage} setLogin={setLogin} setRegister={setRegister} setResetPassword={setResetPassword} setResetVerify={setResetVerify} setVerify={setVerify} setTestOtp={setTestOtp} submitForgot={submitForgot} submitLogin={submitLogin} submitRegister={submitRegister} submitResetPassword={submitResetPassword} submitResetVerify={submitResetVerify} submitVerify={submitVerify} testOtp={testOtp} verify={verify} resend={() => runBusy("Sending OTP...", () => requestOtp(authScreen === "verify" ? preAuth! : resetAuth!))} /> : null}
        {root === "app" ? <AppShell appScreen={appScreen} search={search} setAppScreen={setAppScreen} setSearch={setSearch} user={user} visibleCrops={visibleCrops} logout={logout} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Splash({ darkMode }: { darkMode: boolean }) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.035, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [fade, pulse, rise]);

  return <ImageBackground source={darkMode ? splashDarkBackground : splashLightBackground} resizeMode="cover" style={s.splash}><View style={[s.overlay, darkMode ? s.overlayDark : s.overlayLight]} /><Animated.View style={[s.splashCard, s.splashBrandCard, { opacity: fade, transform: [{ translateY: rise }, { scale: pulse }] }]}><Brand inverse={darkMode} /></Animated.View></ImageBackground>;
}

function LoadingScreen({ darkMode }: { darkMode: boolean }) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDots((current) => (current + 1) % 4);
    }, 450);
    return () => clearInterval(timer);
  }, []);

  return <ImageBackground source={darkMode ? splashDarkBackground : splashLightBackground} resizeMode="cover" style={s.loadingScreen}><View style={[s.overlay, darkMode ? s.overlayDark : s.overlayLight]} /><View style={s.loadingCard}><Brand inverse={darkMode} compact /><ActivityIndicator color={darkMode ? "#F4F7EA" : colors.green} style={s.loadingSpinner} /><Text style={[s.loadingTitle, darkMode && s.loadingTitleInverse]}>Loading{".".repeat(dots)}</Text><Text style={[s.metaCenter, darkMode && s.metaCenterInverse]}>Preparing your farm workspace...</Text></View></ImageBackground>;
}

function AuthLayout(props: { authScreen: AuthScreen; busy: string; error: string; forgot: { email: string }; language: LanguageCode; login: { email: string; password: string }; notice: string; register: { username: string; email: string; password: string; full_name: string; city: string; state: string; district: string; pincode: string; role: string }; resetPassword: { password: string; confirm_password: string }; resetVerify: { email: string; otp: string }; setAuthScreen: (screen: AuthScreen) => void; setForgot: React.Dispatch<React.SetStateAction<{ email: string }>>; setLanguage: React.Dispatch<React.SetStateAction<LanguageCode>>; setLogin: React.Dispatch<React.SetStateAction<{ email: string; password: string }>>; setRegister: React.Dispatch<React.SetStateAction<{ username: string; email: string; password: string; full_name: string; city: string; state: string; district: string; pincode: string; role: string }>>; setResetPassword: React.Dispatch<React.SetStateAction<{ password: string; confirm_password: string }>>; setResetVerify: React.Dispatch<React.SetStateAction<{ email: string; otp: string }>>; setVerify: React.Dispatch<React.SetStateAction<{ email: string; otp: string }>>; setTestOtp: React.Dispatch<React.SetStateAction<string>>; submitForgot: () => Promise<void>; submitLogin: () => Promise<void>; submitRegister: () => Promise<void>; submitResetPassword: () => Promise<void>; submitResetVerify: () => Promise<void>; submitVerify: () => Promise<void>; testOtp: string; verify: { email: string; otp: string }; resend: () => Promise<void> }) {
  const { authScreen, busy, error, forgot, language, login, notice, register, resetPassword, resetVerify, setAuthScreen, setForgot, setLanguage, setLogin, setRegister, setResetPassword, setResetVerify, setVerify, setTestOtp, submitForgot, submitLogin, submitRegister, submitResetPassword, submitResetVerify, submitVerify, testOtp, verify, resend } = props;
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  return (
    <ScrollView contentContainerStyle={s.authWrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.authHero}>
        <View style={s.languageRow}>
          <Text style={s.languageLabel}>{t(language, "language_label")}</Text>
          <View style={s.languageDropdownWrap}>
            <Pressable style={s.languageDropdownTrigger} onPress={() => setLanguageMenuOpen((current) => !current)}>
              <Text style={s.languageDropdownValue}>{LANGUAGE_OPTIONS.find((option) => option.code === language)?.label || "EN"}</Text>
              <FontAwesome6 color={colors.dark} name={languageMenuOpen ? "chevron-up" : "chevron-down"} size={12} />
            </Pressable>
            {languageMenuOpen ? (
              <View style={s.languageDropdownMenu}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.code}
                    style={[s.languageDropdownItem, language === option.code && s.languageDropdownItemActive]}
                    onPress={() => {
                      setLanguage(option.code);
                      setLanguageMenuOpen(false);
                    }}
                  >
                    <Text style={[s.languageDropdownItemText, language === option.code && s.languageDropdownItemTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <Brand compact tagline={t(language, "brand_tagline")} />
        <Text style={s.heroTitle}>{t(language, "auth_hero_title")}</Text>
        <Text style={s.meta}>{t(language, "auth_hero_body")}</Text>
      </View>
      {error ? <Notice tone="error" text={error} /> : null}
      {notice ? <Notice tone="info" text={notice} /> : null}
      {testOtp ? <Notice tone="otp" text={`Use test OTP ${testOtp} while EXPOSE_TEST_OTP is enabled.`} /> : null}
      <View style={s.card}>
        {authScreen === "login" ? <>
          <Text style={s.title}>{t(language, "login_title")}</Text>
          <Field icon="envelope" label={t(language, "email")}><TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setLogin((current) => ({ ...current, email: value }))} placeholder={t(language, "placeholder_email")} placeholderTextColor="#8A938C" style={s.input} value={login.email} /></Field>
          <Field icon="lock" label={t(language, "password")}><TextInput onChangeText={(value) => setLogin((current) => ({ ...current, password: value }))} placeholder={t(language, "placeholder_password")} placeholderTextColor="#8A938C" secureTextEntry style={s.input} value={login.password} /></Field>
          <Action disabled={Boolean(busy)} label={busy || t(language, "continue_to_otp")} onPress={submitLogin} />
          <Text style={s.link} onPress={() => { setTestOtp(""); setAuthScreen("forgot"); }}>{t(language, "forgot_password")}</Text>
          <Text style={s.link} onPress={() => { setTestOtp(""); setAuthScreen("register"); }}>{t(language, "no_account")} <Text style={s.bold}>{t(language, "sign_up")}</Text></Text>
        </> : null}
        {authScreen === "verify" ? <>
          <Text style={s.title}>{t(language, "verify_title")}</Text>
          <Field icon="envelope" label={t(language, "email")}><TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setVerify((current) => ({ ...current, email: value }))} placeholder={t(language, "placeholder_email")} placeholderTextColor="#8A938C" style={s.input} value={verify.email} /></Field>
          <Field icon="key" label={t(language, "otp")}><TextInput keyboardType="number-pad" onChangeText={(value) => setVerify((current) => ({ ...current, otp: value }))} placeholder={t(language, "placeholder_otp")} placeholderTextColor="#8A938C" style={s.input} value={verify.otp} /></Field>
          <Action disabled={Boolean(busy)} label={busy || t(language, "verify_and_login")} onPress={submitVerify} />
          <Text style={s.link} onPress={resend}>{t(language, "resend_otp")}</Text>
          <Text style={s.link} onPress={() => { setTestOtp(""); setAuthScreen("login"); }}>{t(language, "back_to_login")}</Text>
        </> : null}
        {authScreen === "register" ? <>
          <Text style={s.title}>{t(language, "register_title")}</Text>
          <Field icon="user" label={t(language, "username")}><TextInput autoCapitalize="none" onChangeText={(value) => setRegister((current) => ({ ...current, username: value }))} placeholder={t(language, "placeholder_username")} placeholderTextColor="#8A938C" style={s.input} value={register.username} /></Field>
          <Field icon="id-card" label={t(language, "full_name")}><TextInput onChangeText={(value) => setRegister((current) => ({ ...current, full_name: value }))} placeholder={t(language, "placeholder_full_name")} placeholderTextColor="#8A938C" style={s.input} value={register.full_name} /></Field>
          <Field icon="envelope" label={t(language, "email")}><TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setRegister((current) => ({ ...current, email: value }))} placeholder={t(language, "placeholder_email")} placeholderTextColor="#8A938C" style={s.input} value={register.email} /></Field>
          <Field icon="lock" label={t(language, "password")}><TextInput onChangeText={(value) => setRegister((current) => ({ ...current, password: value }))} placeholder={t(language, "placeholder_password_min")} placeholderTextColor="#8A938C" secureTextEntry style={s.input} value={register.password} /></Field>
          <Field icon="users" label={t(language, "role")}><View style={s.row}>{["customer", "farmer"].map((role) => <Pressable key={role} style={[s.chip, register.role === role && s.chipActive]} onPress={() => setRegister((current) => ({ ...current, role }))}><Text style={[s.chipText, register.role === role && s.chipTextActive]}>{role === "customer" ? t(language, "customer") : t(language, "farmer")}</Text></Pressable>)}</View></Field>
          <Field icon="location-dot" label={t(language, "city")}><TextInput onChangeText={(value) => setRegister((current) => ({ ...current, city: value }))} placeholder={t(language, "placeholder_city")} placeholderTextColor="#8A938C" style={s.input} value={register.city} /></Field>
          <Field icon="map" label={t(language, "state")}><TextInput onChangeText={(value) => setRegister((current) => ({ ...current, state: value }))} placeholder={t(language, "placeholder_state")} placeholderTextColor="#8A938C" style={s.input} value={register.state} /></Field>
          <Field icon="map-pin" label={t(language, "district")}><TextInput onChangeText={(value) => setRegister((current) => ({ ...current, district: value }))} placeholder={t(language, "placeholder_district")} placeholderTextColor="#8A938C" style={s.input} value={register.district} /></Field>
          <Field icon="hashtag" label={t(language, "pincode")}><TextInput keyboardType="number-pad" onChangeText={(value) => setRegister((current) => ({ ...current, pincode: value }))} placeholder={t(language, "placeholder_pincode")} placeholderTextColor="#8A938C" style={s.input} value={register.pincode} /></Field>
          <Action disabled={Boolean(busy)} label={busy || t(language, "create_account")} onPress={submitRegister} />
          <Text style={s.link} onPress={() => setAuthScreen("login")}>{t(language, "already_account")} <Text style={s.bold}>{t(language, "login_link")}</Text></Text>
        </> : null}
        {authScreen === "forgot" ? <>
          <Text style={s.title}>{t(language, "forgot_title")}</Text>
          <Field icon="envelope" label={t(language, "registered_email")}><TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setForgot({ email: value })} placeholder={t(language, "placeholder_email")} placeholderTextColor="#8A938C" style={s.input} value={forgot.email} /></Field>
          <Action disabled={Boolean(busy)} label={busy || t(language, "start_reset_flow")} onPress={submitForgot} />
          <Text style={s.link} onPress={() => setAuthScreen("login")}>{t(language, "back_to_login")}</Text>
        </> : null}
        {authScreen === "resetVerify" ? <>
          <Text style={s.title}>{t(language, "reset_verify_title")}</Text>
          <Field icon="envelope" label={t(language, "email")}><TextInput autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setResetVerify((current) => ({ ...current, email: value }))} placeholder={t(language, "placeholder_email")} placeholderTextColor="#8A938C" style={s.input} value={resetVerify.email} /></Field>
          <Field icon="key" label={t(language, "otp")}><TextInput keyboardType="number-pad" onChangeText={(value) => setResetVerify((current) => ({ ...current, otp: value }))} placeholder={t(language, "placeholder_otp")} placeholderTextColor="#8A938C" style={s.input} value={resetVerify.otp} /></Field>
          <Action disabled={Boolean(busy)} label={busy || t(language, "confirm_otp")} onPress={submitResetVerify} />
          <Text style={s.link} onPress={resend}>{t(language, "resend_otp")}</Text>
        </> : null}
        {authScreen === "resetPassword" ? <>
          <Text style={s.title}>{t(language, "reset_password_title")}</Text>
          <Field icon="lock" label={t(language, "new_password")}><TextInput onChangeText={(value) => setResetPassword((current) => ({ ...current, password: value }))} placeholder={t(language, "placeholder_new_password")} placeholderTextColor="#8A938C" secureTextEntry style={s.input} value={resetPassword.password} /></Field>
          <Field icon="lock" label={t(language, "confirm_password")}><TextInput onChangeText={(value) => setResetPassword((current) => ({ ...current, confirm_password: value }))} placeholder={t(language, "placeholder_confirm_password")} placeholderTextColor="#8A938C" secureTextEntry style={s.input} value={resetPassword.confirm_password} /></Field>
          <Action disabled={Boolean(busy)} label={busy || t(language, "update_password")} onPress={submitResetPassword} />
        </> : null}
      </View>
    </ScrollView>
  );
}

function AppShell({ appScreen, search, setAppScreen, setSearch, user, visibleCrops, logout }: { appScreen: AppScreen; search: string; setAppScreen: (screen: AppScreen) => void; setSearch: (value: string) => void; user: User | null; visibleCrops: Array<(typeof crops)[number]>; logout: () => void }) {
  const providerMap = {
    UPI: ["PhonePe", "Google Pay", "Paytm"],
    Card: ["Visa Test", "Mastercard Test", "RuPay Test"],
    "Net Banking": ["HDFC Bank", "ICICI Bank", "SBI"],
  } as const;
  const [selectedCrop, setSelectedCrop] = useState<(typeof crops)[number] | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "Card" | "Net Banking">("UPI");
  const [paymentProvider, setPaymentProvider] = useState("PhonePe");
  const [orderQty, setOrderQty] = useState("2");
  const [upiId, setUpiId] = useState("demo@upi");
  const [cardName, setCardName] = useState(user?.full_name || user?.username || "Demo Customer");
  const [cardNumber, setCardNumber] = useState("4111 1111 1111 1111");
  const [cardExpiry, setCardExpiry] = useState("12/30");
  const [cardCvv, setCardCvv] = useState("123");
  const [bankName, setBankName] = useState("HDFC Bank");
  const [accountHolder, setAccountHolder] = useState(user?.full_name || user?.username || "Demo Customer");
  const [gatewayMessage, setGatewayMessage] = useState("");
  const [pickerBusy, setPickerBusy] = useState("");
  const [diseaseCrop, setDiseaseCrop] = useState("Tomato");
  const [diseaseSymptoms, setDiseaseSymptoms] = useState("");
  const [diseaseImageUri, setDiseaseImageUri] = useState("");
  const [diseaseReport, setDiseaseReport] = useState<{ risk: string; diagnosis: string; recommendation: string } | null>(null);
  const [orders, setOrders] = useState<Array<{ id: string; cropName: string; quantity: string; total: string; paymentMethod: string; provider: string; reference: string; status: string; trackingCode: string; invoiceNumber: string; note: string }>>([
    {
      id: "ORD-DEMO-101",
      cropName: "Tomatoes",
      quantity: "4 kg",
      total: "180.00",
      paymentMethod: "UPI",
      provider: "PhonePe",
      reference: "UPI-DEMO-1001",
      status: "Order Confirmed",
      trackingCode: "TRK-DMO-101",
      invoiceNumber: "INV-DMO-101",
      note: "Sample sandbox order",
    },
  ]);

  useEffect(() => {
    setPaymentProvider(providerMap[paymentMethod][0]);
  }, [paymentMethod]);

  const openCheckout = (crop: (typeof crops)[number]) => {
    setSelectedCrop(crop);
    setOrderQty(crop.id === "wheat" ? "1" : "2");
    setGatewayMessage(`Sandbox checkout opened for ${crop.name}.`);
  };

  const closeCheckout = () => {
    setSelectedCrop(null);
  };

  const confirmSandboxPayment = () => {
    if (!selectedCrop) {
      return;
    }
    const quantity = Math.max(1, Number(orderQty) || 1);
    const total = (selectedCrop.priceValue * quantity).toFixed(2);
    if (paymentMethod === "UPI" && !upiId.includes("@")) {
      Alert.alert("Invalid UPI", "Enter a sandbox UPI ID like demo@upi.");
      return;
    }
    if (paymentMethod === "Card" && cardNumber.replace(/\D+/g, "").length < 12) {
      Alert.alert("Invalid card", "Use a test card like 4111 1111 1111 1111.");
      return;
    }
    if (paymentMethod === "Net Banking" && !bankName.trim()) {
      Alert.alert("Bank missing", "Enter a bank name for sandbox net banking.");
      return;
    }
    const reference = paymentMethod === "UPI" ? `UPI-${Date.now()}` : paymentMethod === "Card" ? `CARD-${Date.now()}` : `NB-${Date.now()}`;
    const newOrder = {
      id: `ORD-${Date.now()}`,
      cropName: selectedCrop.name,
      quantity: `${quantity} ${selectedCrop.unit}`,
      total,
      paymentMethod,
      provider: paymentMethod === "Net Banking" ? bankName : paymentProvider,
      reference,
      status: "Order Confirmed",
      trackingCode: `TRK-${String(Date.now()).slice(-6)}`,
      invoiceNumber: `INV-${String(Date.now()).slice(-6)}`,
      note: paymentMethod === "UPI" ? `UPI ${upiId}` : paymentMethod === "Card" ? `Card **** ${cardNumber.replace(/\D+/g, "").slice(-4)}` : `Net Banking ${bankName}`,
    };
    setOrders((current) => [newOrder, ...current]);
    setGatewayMessage(`${paymentMethod} sandbox payment approved for ${selectedCrop.name}. Ref ${reference}`);
    setSelectedCrop(null);
    setAppScreen("orders");
    Alert.alert("Sandbox payment approved", `Reference: ${reference}`);
  };

  const pickDiseaseImage = async (source: "camera" | "library") => {
    try {
      setPickerBusy(source === "camera" ? "Opening camera..." : "Opening gallery...");
      const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", source === "camera" ? "Camera permission is required to capture crop images." : "Photo library permission is required to choose crop images.");
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setDiseaseImageUri(result.assets[0].uri);
      }
    } finally {
      setPickerBusy("");
    }
  };

  const runDiseaseScanner = () => {
    const symptom = diseaseSymptoms.toLowerCase();
    let risk = "Low";
    let diagnosis = "Healthy canopy";
    let recommendation = "Keep regular scouting and maintain balanced watering.";
    if (symptom.includes("spot") || symptom.includes("blight")) {
      risk = "High";
      diagnosis = "Leaf spot / blight pressure";
      recommendation = "Remove infected leaves, reduce overhead irrigation, and schedule a preventive fungicide check.";
    } else if (symptom.includes("yellow") || symptom.includes("curl")) {
      risk = "Medium";
      diagnosis = "Heat or nutrient stress";
      recommendation = "Inspect micronutrients, water early morning, and check for sucking pests.";
    } else if (symptom.includes("rot") || symptom.includes("wilting")) {
      risk = "High";
      diagnosis = "Root-zone stress";
      recommendation = "Reduce irrigation, improve drainage, and inspect the root zone for rot.";
    }
    if (diseaseImageUri && risk === "Low") {
      diagnosis = "Image uploaded for manual crop-health review";
      recommendation = "Image attached successfully. Use this preview when integrating the live disease API endpoint.";
    }
    setDiseaseReport({ risk, diagnosis, recommendation });
    Alert.alert("Disease scan ready", `${diagnosis} (${risk} risk)`);
  };

  const renderMethodChip = (method: "UPI" | "Card" | "Net Banking") => (
    <Pressable key={method} style={[s.chip, paymentMethod === method && s.chipActive]} onPress={() => setPaymentMethod(method)}>
      <Text style={[s.chipText, paymentMethod === method && s.chipTextActive]}>{method}</Text>
    </Pressable>
  );

  const renderDashboard = () => (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>Hello, {user?.full_name || user?.username || "Farmer"}</Text>
      <View style={s.miniCard}>
        <Text style={s.sectionText}>Smart farming snapshot</Text>
        <Text style={s.meta}>{user?.district || user?.city || "Local market"} · Sandbox gateway + image upload enabled</Text>
        <View style={[s.row, { marginTop: 12 }]}> 
          <View style={{ backgroundColor: colors.soft, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}><Text style={{ color: colors.dark, fontWeight: "700" }}>UPI / Card / Net Banking</Text></View>
          <View style={{ backgroundColor: colors.soft, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}><Text style={{ color: colors.dark, fontWeight: "700" }}>Image upload ready</Text></View>
        </View>
      </View>
      {gatewayMessage ? <Notice tone="info" text={gatewayMessage} /> : null}
      <View style={s.listCard}>
        <Text style={s.sectionText}>Disease scanner</Text>
        <Text style={s.meta}>Capture or upload a crop image and combine it with symptoms for a quick dev scan.</Text>
        <View style={{ marginTop: 12 }}>
          <Field icon="leaf" label="Crop name"><TextInput onChangeText={setDiseaseCrop} placeholder="Tomato" placeholderTextColor="#8A938C" style={s.input} value={diseaseCrop} /></Field>
          <Field icon="stethoscope" label="Symptoms"><TextInput onChangeText={setDiseaseSymptoms} placeholder="Yellow leaves, spots, wilting" placeholderTextColor="#8A938C" style={s.input} value={diseaseSymptoms} /></Field>
        </View>
        <View style={[s.row, { marginTop: 6 }]}> 
          <Pressable style={s.chip} onPress={() => pickDiseaseImage("camera")}><Text style={s.chipText}>Camera</Text></Pressable>
          <Pressable style={s.chip} onPress={() => pickDiseaseImage("library")}><Text style={s.chipText}>Upload image</Text></Pressable>
          <Pressable style={[s.chip, { backgroundColor: colors.green }]} onPress={runDiseaseScanner}><Text style={[s.chipText, { color: "#FFFFFF" }]}>Scan now</Text></Pressable>
        </View>
        {pickerBusy ? <Text style={[s.meta, { marginTop: 10 }]}>{pickerBusy}</Text> : null}
        {diseaseImageUri ? <Image source={{ uri: diseaseImageUri }} style={{ width: "100%", height: 180, borderRadius: 16, marginTop: 14 }} /> : null}
        {diseaseReport ? <View style={[s.notice, { backgroundColor: "#EDF6EE", borderColor: "#CFE2D0", marginTop: 14 }]}><Text style={s.noticeText}>{diseaseReport.diagnosis} · {diseaseReport.risk} risk</Text><Text style={[s.meta, { marginTop: 6 }]}>{diseaseReport.recommendation}</Text></View> : null}
      </View>
      <View style={s.listCard}>
        <Text style={s.sectionText}>Quick actions</Text>
        <Text style={s.meta}>Open the marketplace checkout or review sandbox orders with invoice and tracking metadata.</Text>
        <View style={[s.row, { marginTop: 12 }]}> 
          <Pressable style={[s.action, { flex: 1, marginTop: 0 }]} onPress={() => setAppScreen("marketplace")}><Text style={s.actionText}>Open marketplace</Text></Pressable>
          <Pressable style={[s.action, { flex: 1, marginTop: 0, backgroundColor: colors.dark }]} onPress={() => setAppScreen("orders")}><Text style={s.actionText}>View orders</Text></Pressable>
        </View>
      </View>
    </ScrollView>
  );

  const renderMarketplace = () => (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>Marketplace</Text>
      <View style={s.fieldBox}><FontAwesome6 color={colors.dark} name="magnifying-glass" size={16} /><TextInput onChangeText={setSearch} placeholder="Search crops..." placeholderTextColor="#8A938C" style={s.input} value={search} /></View>
      {selectedCrop ? (
        <View style={[s.listCard, { borderColor: "#CFE2D0", backgroundColor: "#F5FBF3" }]}>
          <Text style={s.sectionText}>Sandbox checkout · {selectedCrop.name}</Text>
          <Text style={s.meta}>Choose UPI, card, or net banking. This is a development-only dummy gateway flow.</Text>
          <View style={[s.row, { marginTop: 12 }]}>{(["UPI", "Card", "Net Banking"] as const).map(renderMethodChip)}</View>
          <View style={{ marginTop: 12 }}>
            <Field icon="boxes-stacked" label="Quantity"><TextInput keyboardType="numeric" onChangeText={setOrderQty} placeholder="2" placeholderTextColor="#8A938C" style={s.input} value={orderQty} /></Field>
            <Field icon="building-columns" label="Provider / bank"><TextInput onChangeText={(value) => { setPaymentProvider(value); if (paymentMethod === "Net Banking") setBankName(value); }} placeholder={providerMap[paymentMethod][0]} placeholderTextColor="#8A938C" style={s.input} value={paymentMethod === "Net Banking" ? bankName : paymentProvider} /></Field>
            {paymentMethod === "UPI" ? <Field icon="qrcode" label="UPI ID"><TextInput onChangeText={setUpiId} placeholder="demo@upi" placeholderTextColor="#8A938C" style={s.input} value={upiId} /></Field> : null}
            {paymentMethod === "Card" ? <>
              <Field icon="user" label="Card holder"><TextInput onChangeText={setCardName} placeholder="Demo Customer" placeholderTextColor="#8A938C" style={s.input} value={cardName} /></Field>
              <Field icon="credit-card" label="Card number"><TextInput keyboardType="number-pad" onChangeText={setCardNumber} placeholder="4111 1111 1111 1111" placeholderTextColor="#8A938C" style={s.input} value={cardNumber} /></Field>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}><Field icon="calendar" label="Expiry"><TextInput onChangeText={setCardExpiry} placeholder="12/30" placeholderTextColor="#8A938C" style={s.input} value={cardExpiry} /></Field></View>
                <View style={{ flex: 1 }}><Field icon="lock" label="CVV"><TextInput keyboardType="number-pad" onChangeText={setCardCvv} placeholder="123" placeholderTextColor="#8A938C" secureTextEntry style={s.input} value={cardCvv} /></Field></View>
              </View>
            </> : null}
            {paymentMethod === "Net Banking" ? <>
              <Field icon="building-columns" label="Bank name"><TextInput onChangeText={setBankName} placeholder="HDFC Bank" placeholderTextColor="#8A938C" style={s.input} value={bankName} /></Field>
              <Field icon="user" label="Account holder"><TextInput onChangeText={setAccountHolder} placeholder="Demo Customer" placeholderTextColor="#8A938C" style={s.input} value={accountHolder} /></Field>
            </> : null}
          </View>
          <Text style={[s.meta, { marginTop: 4 }]}>Estimated total: Rs {(selectedCrop.priceValue * Math.max(1, Number(orderQty) || 1)).toFixed(2)}</Text>
          <View style={[s.row, { marginTop: 12 }]}> 
            <Pressable style={[s.action, { flex: 1, marginTop: 0 }]} onPress={confirmSandboxPayment}><Text style={s.actionText}>Approve sandbox payment</Text></Pressable>
            <Pressable style={[s.chip, { alignSelf: "center" }]} onPress={closeCheckout}><Text style={s.chipText}>Close</Text></Pressable>
          </View>
        </View>
      ) : null}
      {visibleCrops.map((crop) => (
        <View key={crop.id} style={s.listCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionText}>{crop.name}</Text>
              <Text style={s.meta}>{crop.location} · {crop.price}</Text>
            </View>
            <View style={[s.chip, crop.verified && { backgroundColor: colors.green }]}><Text style={[s.chipText, crop.verified && { color: "#FFFFFF" }]}>{crop.verified ? "Verified" : "Open listing"}</Text></View>
          </View>
          <View style={[s.row, { marginTop: 10 }]}> 
            {crop.organic ? <View style={[s.chip, { backgroundColor: colors.soft }]}><Text style={s.chipText}>Organic</Text></View> : null}
            <View style={s.chip}><Text style={s.chipText}>Dummy gateway ready</Text></View>
            <View style={s.chip}><Text style={s.chipText}>Image upload enabled</Text></View>
          </View>
          <Pressable style={[s.action, { marginTop: 14 }]} onPress={() => openCheckout(crop)}><Text style={s.actionText}>Open sandbox checkout</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );

  const renderOrders = () => (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>Orders</Text>
      {gatewayMessage ? <Notice tone="info" text={gatewayMessage} /> : null}
      {orders.map((order) => (
        <View key={order.id} style={s.listCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionText}>{order.cropName}</Text>
              <Text style={s.meta}>{order.quantity} · Rs {order.total}</Text>
            </View>
            <View style={[s.chip, { backgroundColor: colors.green }]}><Text style={[s.chipText, { color: "#FFFFFF" }]}>{order.status}</Text></View>
          </View>
          <Text style={[s.meta, { marginTop: 8 }]}>Method: {order.paymentMethod} via {order.provider}</Text>
          <Text style={s.meta}>Reference: {order.reference}</Text>
          <Text style={s.meta}>Invoice: {order.invoiceNumber} · Tracking: {order.trackingCode}</Text>
          <Text style={[s.meta, { marginTop: 8 }]}>{order.note}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const renderProfile = () => (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>Profile</Text>
      <View style={s.listCard}>
        <Text style={s.sectionText}>{user?.full_name || user?.username || "User"}</Text>
        <Text style={s.meta}>{user?.email || ""}</Text>
        <Text style={s.meta}>{[user?.city, user?.district, user?.state].filter(Boolean).join(", ")}</Text>
        <Text style={[s.meta, { marginTop: 10 }]}>Preferred role: {user?.role || "customer"}</Text>
      </View>
      <View style={s.listCard}>
        <Text style={s.sectionText}>Development features enabled</Text>
        <Text style={s.meta}>• Dummy gateway with UPI, card, and net banking</Text>
        <Text style={s.meta}>• Crop image upload / disease preview</Text>
        <Text style={s.meta}>• Local invoice + tracking metadata</Text>
      </View>
      <Action label="Logout" onPress={logout} />
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      {appScreen === "dashboard" ? renderDashboard() : null}
      {appScreen === "marketplace" ? renderMarketplace() : null}
      {appScreen === "orders" ? renderOrders() : null}
      {appScreen === "profile" ? renderProfile() : null}
      <View style={s.nav}>
        {([{ key: "dashboard", icon: "house", label: "Home" }, { key: "marketplace", icon: "store", label: "Market" }, { key: "orders", icon: "receipt", label: "Orders" }, { key: "profile", icon: "user", label: "Profile" }] as const).map((item) => (
          <Pressable key={item.key} style={s.navItem} onPress={() => setAppScreen(item.key)}>
            <FontAwesome6 color={appScreen === item.key ? colors.green : "#8A918A"} name={item.icon} size={18} />
            <Text style={[s.navLabel, appScreen === item.key && { color: colors.green }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Brand({ compact = false, inverse = false, tagline = "Soil to table network" }: { compact?: boolean; inverse?: boolean; tagline?: string }) {
  return <View style={s.brand}><View style={[s.logo, inverse && s.logoInverse]}><FontAwesome6 color="#FFFFFF" name="seedling" size={compact ? 16 : 20} /></View><View><Text style={[s.brandTitle, compact && { fontSize: 20 }, inverse && s.brandTitleInverse]}>Smart Farmer</Text><Text style={[s.brandMeta, inverse && s.brandMetaInverse]}>{tagline}</Text></View></View>;
}

function Field({ icon, label, children }: { icon: React.ComponentProps<typeof FontAwesome6>["name"]; label: string; children: React.ReactNode }) {
  return <View style={{ marginBottom: 12 }}><Text style={s.label}>{label}</Text><View style={s.fieldBox}><FontAwesome6 color={colors.dark} name={icon} size={16} />{children}</View></View>;
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void | Promise<void>; disabled?: boolean }) {
  return <Pressable disabled={disabled} style={[s.action, disabled && { opacity: 0.72 }]} onPress={onPress}><Text style={s.actionText}>{label}</Text></Pressable>;
}

function Notice({ tone, text }: { tone: "error" | "info" | "otp"; text: string }) {
  return <View style={[s.notice, tone === "error" ? { backgroundColor: "#FBEAEA", borderColor: "#F3C5C1" } : tone === "otp" ? { backgroundColor: "#FFF2D8", borderColor: "#F0CF8E" } : { backgroundColor: "#EDF6EE", borderColor: "#CFE2D0" }]}><Text style={s.noticeText}>{text}</Text></View>;
}

async function apiRequest(path: string, body: Record<string, unknown>): Promise<ApiResult> {
  try {
    const response = await fetch(`${API_URL}${path}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await safeJson(response);
    return { ok: response.ok && Boolean(payload.success), message: text(payload.message) || "Request failed.", payload };
  } catch {
    return { ok: false, message: `Unable to reach ${API_URL}. Start the API server and keep your phone and computer on the same network.`, payload: {} };
  }
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function asUser(value: unknown): User | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  return { id: text(record.id), username: text(record.username), email: text(record.email), role: text(record.role), full_name: text(record.full_name), city: text(record.city), state: text(record.state), district: text(record.district), pincode: text(record.pincode), is_verified: Boolean(record.is_verified) };
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  splash: { flex: 1, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayDark: { backgroundColor: "rgba(4,10,7,0.34)" },
  overlayLight: { backgroundColor: "rgba(22,37,18,0.24)" },
  splashCard: { paddingHorizontal: 24, paddingVertical: 20, borderRadius: 28, backgroundColor: "rgba(246,250,241,0.80)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", shadowColor: "#0D1D12", shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 10 } },
  splashBrandCard: { minWidth: 260, alignItems: "center" },
  splashLoading: { alignItems: "center" },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  loadingCard: { paddingHorizontal: 24, paddingVertical: 26, borderRadius: 28, backgroundColor: "rgba(246,250,241,0.80)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", shadowColor: "#0D1D12", shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, alignItems: "center", minWidth: 280 },
  loadingSpinner: { marginTop: 20, marginBottom: 12 },
  loadingTitle: { color: colors.dark, fontSize: 20, fontWeight: "800", marginBottom: 6 },
  loadingTitleInverse: { color: "#F4F7EA" },
  metaCenter: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  metaCenterInverse: { color: "rgba(244,247,234,0.82)" },
  authWrap: { padding: 18, paddingBottom: 36 },
  authHero: { backgroundColor: colors.soft, borderRadius: 28, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: "#D5E7D5" },
  languageRow: { marginBottom: 16, zIndex: 10 },
  languageLabel: { fontSize: 12, fontWeight: "700", color: colors.dark, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.1 },
  languageDropdownWrap: { position: "relative", alignSelf: "flex-start", minWidth: 96 },
  languageDropdownTrigger: { minHeight: 42, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#F9FCF5", borderWidth: 1, borderColor: "#D5E7D5", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  languageDropdownValue: { fontSize: 13, fontWeight: "800", color: colors.dark },
  languageDropdownMenu: { position: "absolute", top: 48, left: 0, right: 0, backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#D5E7D5", paddingVertical: 6, shadowColor: "#0D1D12", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  languageDropdownItem: { paddingHorizontal: 14, paddingVertical: 10 },
  languageDropdownItemActive: { backgroundColor: "#EDF6EE" },
  languageDropdownItemText: { fontSize: 13, fontWeight: "700", color: colors.text },
  languageDropdownItemTextActive: { color: colors.green },
  heroTitle: { fontSize: 28, fontWeight: "800", color: colors.text, marginTop: 16, marginBottom: 6 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 26, fontWeight: "800", color: colors.dark, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "700", color: colors.dark, marginBottom: 6 },
  fieldBox: { minHeight: 56, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, backgroundColor: "#FBFCF8", flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 16 },
  action: { backgroundColor: colors.green, borderRadius: 14, paddingVertical: 17, alignItems: "center", marginTop: 8, marginBottom: 14 },
  actionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  link: { color: colors.text, fontSize: 14, marginBottom: 10, textAlign: "center" },
  bold: { fontWeight: "800" },
  notice: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  logoInverse: { backgroundColor: "#1F6A3A" },
  brandTitle: { color: colors.dark, fontSize: 22, fontWeight: "700" },
  brandTitleInverse: { color: "#F4F7EA" },
  brandMeta: { color: "rgba(31,106,58,0.70)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 2.1 },
  brandMetaInverse: { color: "rgba(244,247,234,0.78)" },
  page: { padding: 18, paddingBottom: 110 },
  meta: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  miniCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  sectionText: { fontSize: 18, fontWeight: "700", color: colors.text },
  listCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: "#E8EBE7" },
  chipActive: { backgroundColor: colors.green },
  chipText: { color: "#4D564F", fontWeight: "700" },
  chipTextActive: { color: "#FFFFFF" },
  nav: { position: "absolute", left: 12, right: 12, bottom: 12, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 22, paddingVertical: 10, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border },
  navItem: { flex: 1, alignItems: "center", gap: 4 },
  navLabel: { fontSize: 11, color: "#8A918A" },
});
