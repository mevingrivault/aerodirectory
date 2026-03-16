"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Key, Mail, CheckCircle } from "lucide-react";
import type { TotpSetupResponse } from "@aerodirectory/shared";

export default function ProfilePage() {
  const { user } = useAuth();
  const [totpSetup, setTotpSetup] = useState<TotpSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [message, setMessage] = useState("");

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Please sign in to view your profile.
      </div>
    );
  }

  const handleSetupTotp = async () => {
    const res = await apiClient.post<TotpSetupResponse>("/auth/totp/setup");
    setTotpSetup(res.data);
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post("/auth/totp/verify", { code: totpCode });
      setMessage("Two-factor authentication enabled successfully!");
      setTotpSetup(null);
      setTotpCode("");
    } catch {
      setMessage("Invalid code. Please try again.");
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>

      {/* Profile info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{user.email}</span>
            </div>
            {user.emailVerified ? (
              <Badge variant="success">
                <CheckCircle className="mr-1 h-3 w-3" /> Verified
              </Badge>
            ) : (
              <Badge variant="warning">Unverified</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Display Name</span>
            <span>{user.displayName || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="secondary">{user.role}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Member since</span>
            <span>{new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
          </div>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" /> Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          {message && (
            <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}

          {user.totpEnabled ? (
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-green-600" />
              <span className="text-green-700 font-medium">
                TOTP is enabled on your account
              </span>
            </div>
          ) : totpSetup ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={totpSetup.qrCodeUrl}
                alt="TOTP QR Code"
                className="mx-auto w-48 h-48"
              />
              <p className="text-xs text-muted-foreground text-center break-all">
                Manual key: {totpSetup.secret}
              </p>
              <form onSubmit={handleVerifyTotp} className="flex gap-2">
                <Input
                  placeholder="Enter 6-digit code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                />
                <Button type="submit">Verify</Button>
              </form>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Add an extra layer of security with TOTP-based two-factor authentication.
              </p>
              <Button variant="outline" onClick={handleSetupTotp}>
                <Key className="mr-2 h-4 w-4" /> Enable 2FA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
