"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, User, QrCode, MessageSquare, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api/client";
import { BrandLogo } from "@/components/BrandLogo";

const slides = [
  {
    title: "Connect WhatsApp With Evolution API",
    description: "Scan the QR code and bring live WhatsApp chats into one inbox.",
  },
  {
    title: "Live Team Inbox",
    description: "Read and reply to connected WhatsApp conversations from the app.",
  },
  {
    title: "Production MVP",
    description: "Focused on the working login, connection, and inbox flow.",
  },
];

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (isLogin) {
        const result = await apiSend<{ user: { role: string } }>("/api/auth/login", "POST", { email, password });
        router.push(result.user.role === "super_admin" ? "/super-admin" : "/inbox");
      } else {
        await apiSend("/api/auth/register", "POST", { name, email, password });
        router.push("/inbox");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
  };

  return (
    <div className="min-h-screen bg-background grid-bg">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-2">
        <section className={`${isLogin ? "lg:order-1" : "lg:order-2"} hidden border-border bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between ${isLogin ? "lg:border-r" : "lg:border-l"} p-12 transition-all duration-500`}>
          <BrandLogo
            iconClassName="h-12 w-12"
            textClassName="font-display text-xl font-bold tracking-tight text-primary-foreground"
          />

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-lg border border-primary-foreground/15 bg-primary-foreground p-5 text-primary shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evolution API</p>
                  <h2 className="mt-1 font-display text-xl font-bold">ClientFlow Inbox</h2>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { icon: Lock, title: "Protected Access", sub: "Login and signup are enabled" },
                  { icon: QrCode, title: "QR Connection", sub: "Connect WhatsApp through Evolution" },
                  { icon: Shield, title: "Live Inbox", sub: "Only connected chats are shown" },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-display text-3xl font-bold tracking-tight">
                {slides[currentSlide].title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-primary-foreground/70">
                {slides[currentSlide].description}
              </p>
              <div className="mt-6 flex gap-2">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentSlide(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      currentSlide === index ? "w-8 bg-primary-foreground" : "w-2 bg-primary-foreground/35"
                    }`}
                    aria-label={`Show slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-primary-foreground/55">ClientFlow MVP</p>
        </section>

        <section className={`${isLogin ? "lg:order-2" : "lg:order-1"} flex min-h-screen items-center justify-center bg-background px-5 py-10 transition-all duration-500 sm:px-8 lg:px-12`}>
          <div className="w-full max-w-md animate-fade-in rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-8">
              <BrandLogo showText={false} iconClassName="mb-5 h-12 w-12" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ClientFlow</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
                {isLogin ? "Welcome Back" : "Create Account"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {isLogin
                  ? "Sign in to manage your connected WhatsApp inbox."
                  : "Start with an account, then connect Evolution API."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={!isLogin}
                    className="h-12 rounded-lg border-border bg-background pl-12"
                  />
                  <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                </div>
              )}

              <div className="relative">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-lg border-border bg-background pl-12"
                />
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              </div>

              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-12 rounded-lg border-border bg-background pl-12 pr-12"
                />
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {isLogin && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" className="h-4 w-4 rounded border-input accent-foreground" />
                    Remember Me
                  </label>
                  <button type="button" onClick={() => setError("Use your registered password, or create a new account if you don't have one yet.")} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                    Recovery Password
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="h-12 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? "Please wait..." : isLogin ? "Login" : "Sign Up"}
              </Button>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              <p className="text-sm text-center text-muted-foreground">
                {isLogin ? "New here?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  {isLogin ? "Create account" : "Login instead"}
                </button>
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
