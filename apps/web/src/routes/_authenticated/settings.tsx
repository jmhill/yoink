import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@yoink/ui-base/components/tabs';
import { useTheme, type ThemeMode, type ColorTheme } from '@/lib/use-theme';
import { ArrowLeft, LogOut, Sun, Moon, Monitor, Palette, Loader2, User, Building2 } from 'lucide-react';
import { SecuritySection } from '@/components/security-section';
import { OrganizationsSection } from '@/components/organizations-section';
import { MembersSection } from '@/components/members-section';
import { InvitationsSection } from '@/components/invitations-section';
import { TokensSection } from '@/components/tokens-section';
import { logout, getSession, type SessionInfo, type SessionOrganization } from '@/api/auth';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { mode, setMode, colorTheme, setColorTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [currentOrg, setCurrentOrg] = useState<SessionOrganization | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const result = await getSession();
      if (result.ok) {
        setSession(result.data);
        const org = result.data.organizations.find((o) => o.id === result.data.organizationId);
        setCurrentOrg(org ?? null);
      }
    };
    loadSession();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    window.location.href = '/login';
  };

  const modeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const colorThemeOptions: Array<{ value: ColorTheme; label: string }> = [
    { value: 'default', label: 'Default' },
    { value: 'tokyo-night', label: 'Tokyo Night' },
  ];

  // Can this user manage members/invitations?
  const canManageOrg = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  return (
    <div className="container mx-auto max-w-2xl p-4">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Tabs defaultValue="user" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="user" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            User
          </TabsTrigger>
          <TabsTrigger value="organization" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Organization
          </TabsTrigger>
        </TabsList>

        {/* User Settings Tab */}
        <TabsContent value="user" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how Yoink looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Mode</label>
                <div className="flex gap-2">
                  {modeOptions.map(({ value, label, icon: Icon }) => (
                    <Button
                      key={value}
                      variant={mode === value ? 'default' : 'outline'}
                      onClick={() => setMode(value)}
                      className="flex-1"
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Theme</label>
                <div className="flex gap-2">
                  {colorThemeOptions.map(({ value, label }) => (
                    <Button
                      key={value}
                      variant={colorTheme === value ? 'default' : 'outline'}
                      onClick={() => setColorTheme(value)}
                      className="flex-1"
                    >
                      <Palette className="mr-2 h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <SecuritySection />

          {/* Organizations - user's memberships across all orgs */}
          <OrganizationsSection />

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Manage your session</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleLogout} disabled={isLoggingOut} className="w-full">
                {isLoggingOut ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging out...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
              <CardDescription>App information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Version</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                  {__COMMIT_SHA__ === 'dev' ? 'dev' : __COMMIT_SHA__.slice(0, 7)}
                </code>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Settings Tab */}
        <TabsContent value="organization" className="space-y-4">
          {session && currentOrg && (
            <>
              {/* Current org header */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>Current Organization</span>
                </div>
                <div className="text-lg font-semibold mt-1">{currentOrg.name}</div>
              </div>

              {/* Members list - visible to all */}
              <MembersSection
                organizationId={session.organizationId}
                organizationName={currentOrg.name}
                currentUserId={session.user.id}
                currentUserRole={currentOrg.role}
              />

              {/* Invitations - only for admin/owner */}
              {canManageOrg && (
                <InvitationsSection
                  organizationId={session.organizationId}
                  organizationName={currentOrg.name}
                />
              )}

              {/* API Tokens - user can manage their own */}
              <TokensSection />
            </>
          )}

          {!session && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
