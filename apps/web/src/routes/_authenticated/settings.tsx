import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@yoink/ui-base/components/card';
import { tokenStorage } from '@/lib/token';
import { useTheme, type ThemeMode, type ColorTheme } from '@/lib/use-theme';
import { ArrowLeft, LogOut, Sun, Moon, Monitor, Palette } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { mode, setMode, colorTheme, setColorTheme } = useTheme();

  const handleLogout = () => {
    tokenStorage.remove();
    window.location.href = '/config';
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

      <div className="space-y-4">
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

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your session</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleLogout} className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
