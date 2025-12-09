import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import {
  Smartphone,
  Mail,
  MessageSquare,
  Key,
  Shield,
  ShieldCheck,
  ShieldOff,
  QrCode,
  Copy,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Info,
  RefreshCw,
  Download,
  FileText,
} from 'lucide-react';
import QRCode from 'qrcode.react';
import { MFAMethod, MFASetupData } from '@uaip/types';
import { api } from '@/utils/api';

interface MFAMethodConfig {
  id: MFAMethod;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  recommended?: boolean;
}

const mfaMethods: MFAMethodConfig[] = [
  {
    id: MFAMethod.TOTP,
    name: 'Authenticator App',
    description: 'Use Google Authenticator, Authy, or similar apps',
    icon: <Smartphone className="w-5 h-5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    recommended: true,
  },
  {
    id: MFAMethod.SMS,
    name: 'SMS Text Message',
    description: 'Receive codes via text message to your phone',
    icon: <MessageSquare className="w-5 h-5" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    id: MFAMethod.EMAIL,
    name: 'Email',
    description: 'Receive codes via email to your registered address',
    icon: <Mail className="w-5 h-5" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    id: MFAMethod.BACKUP_CODES,
    name: 'Backup Codes',
    description: 'Generate one-time use recovery codes',
    icon: <Key className="w-5 h-5" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
];

export const MFASetup: React.FC = () => {
  const [enabledMethods, setEnabledMethods] = useState<MFAMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<MFAMethod | null>(null);
  const [setupData, setSetupData] = useState<MFASetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [setupStep, setSetupStep] = useState<'select' | 'setup' | 'verify'>('select');
  const { toast } = useToast();

  useEffect(() => {
    fetchMFAStatus();
  }, []);

  const fetchMFAStatus = async () => {
    try {
      const response = await api.get('/security/mfa/status');
      setEnabledMethods(response.data.enabledMethods || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch MFA status',
        variant: 'destructive',
      });
    }
  };

  const handleMethodSelect = async (method: MFAMethod) => {
    try {
      setLoading(true);
      setSelectedMethod(method);

      if (method === MFAMethod.SMS) {
        setSetupStep('setup');
        setLoading(false);
        return;
      }

      const response = await api.post('/security/mfa/setup', { method });
      setSetupData(response.data);
      setSetupStep('setup');
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: 'Failed to initialize MFA setup',
        variant: 'destructive',
      });
      setSelectedMethod(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = async () => {
    if (!phoneNumber) return;

    try {
      setLoading(true);
      const response = await api.post('/security/mfa/setup', {
        method: MFAMethod.SMS,
        phoneNumber,
      });
      setSetupData(response.data);
      setSetupStep('verify');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to setup SMS authentication',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast({
        title: 'Invalid Code',
        description: 'Please enter a 6-digit verification code',
        variant: 'destructive',
      });
      return;
    }

    try {
      setVerifying(true);
      await api.post('/security/mfa/verify', {
        method: selectedMethod,
        code: verificationCode,
        setupId: setupData?.setupId,
      });

      toast({
        title: 'MFA Enabled',
        description: `${selectedMethod} authentication has been successfully enabled`,
      });

      setEnabledMethods((prev) => [...prev, selectedMethod!]);
      handleCancel();
    } catch (error) {
      toast({
        title: 'Verification Failed',
        description: 'Invalid verification code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async (method: MFAMethod) => {
    try {
      await api.delete(`/security/mfa/${method}`);
      setEnabledMethods((prev) => prev.filter((m) => m !== method));
      toast({
        title: 'MFA Disabled',
        description: `${method} authentication has been disabled`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disable MFA method',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    setSelectedMethod(null);
    setSetupData(null);
    setVerificationCode('');
    setPhoneNumber('');
    setSetupStep('select');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const downloadBackupCodes = () => {
    if (!setupData?.backupCodes) return;

    const content =
      `Recovery Codes - ${new Date().toISOString()}\n\n` +
      'Keep these codes in a safe place. Each code can only be used once.\n\n' +
      setupData.backupCodes.join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovery-codes.txt';
    a.click();
  };

  const renderMethodCard = (method: MFAMethodConfig) => {
    const isEnabled = enabledMethods.includes(method.id);

    return (
      <motion.div
        key={method.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        <Card
          className={`relative overflow-hidden transition-all duration-300 ${
            isEnabled ? 'border-green-200 shadow-md' : 'hover:shadow-lg cursor-pointer'
          }`}
          onClick={() => !isEnabled && handleMethodSelect(method.id)}
        >
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${method.bgColor} ${method.color}`}>
                  {method.icon}
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {method.name}
                    {method.recommended && (
                      <Badge variant="secondary" className="text-xs">
                        Recommended
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">{method.description}</CardDescription>
                </div>
              </div>

              {isEnabled && (
                <Badge variant="success" className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Enabled
                </Badge>
              )}
            </div>
          </CardHeader>

          {isEnabled && (
            <CardContent>
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDisable(method.id);
                }}
                className="w-full"
              >
                <ShieldOff className="w-4 h-4 mr-2" />
                Disable
              </Button>
            </CardContent>
          )}
        </Card>
      </motion.div>
    );
  };

  const renderSetupContent = () => {
    if (!selectedMethod || !setupData) return null;

    switch (selectedMethod) {
      case MFAMethod.TOTP:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <QRCode
                value={setupData.qrCode!}
                size={200}
                className="mx-auto border-4 border-white shadow-lg rounded-lg"
              />
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Scan this QR code with your authenticator app. If you can't scan, enter the secret
                key manually.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Secret Key</Label>
              <div className="flex gap-2">
                <Input value={setupData.secret || ''} readOnly className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(setupData.secret!)}
                >
                  {copiedSecret ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        );

      case MFAMethod.SMS:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <Button
              onClick={handlePhoneSubmit}
              disabled={!phoneNumber || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending Code...
                </>
              ) : (
                'Send Verification Code'
              )}
            </Button>
          </div>
        );

      case MFAMethod.EMAIL:
        return (
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertDescription>
              A verification code has been sent to your registered email address. Please check your
              inbox and spam folder.
            </AlertDescription>
          </Alert>
        );

      case MFAMethod.BACKUP_CODES:
        return (
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Store these recovery codes in a safe place. Each code can only be used once.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2">
              {setupData.backupCodes?.map((code, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded font-mono text-sm text-center">
                  {code}
                </div>
              ))}
            </div>

            <Button onClick={downloadBackupCodes} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Codes
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - removed since portal provides its own header */}

      {/* Security Status */}
      <Card
        className={`border-2 ${enabledMethods.length > 0 ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}
      >
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Shield
              className={`w-8 h-8 ${enabledMethods.length > 0 ? 'text-green-600' : 'text-orange-600'}`}
            />
            <div>
              <h3 className="font-semibold">
                {enabledMethods.length > 0 ? 'Account Protected' : 'MFA Not Enabled'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {enabledMethods.length > 0
                  ? `${enabledMethods.length} authentication method${enabledMethods.length > 1 ? 's' : ''} active`
                  : 'Enable MFA to secure your account'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Progress value={(enabledMethods.length / mfaMethods.length) * 100} className="w-24" />
            <span className="text-sm font-medium">
              {enabledMethods.length}/{mfaMethods.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Setup Flow */}
      <AnimatePresence mode="wait">
        {setupStep === 'select' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {mfaMethods.map(renderMethodCard)}
          </motion.div>
        )}

        {(setupStep === 'setup' || setupStep === 'verify') && selectedMethod && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {setupStep === 'setup' ? 'Setup' : 'Verify'}{' '}
                    {mfaMethods.find((m) => m.id === selectedMethod)?.name}
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={handleCancel}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {setupStep === 'setup' && renderSetupContent()}

                {(setupStep === 'verify' ||
                  (setupStep === 'setup' && selectedMethod !== MFAMethod.SMS)) && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Verification Code</Label>
                      <Input
                        type="text"
                        placeholder="000000"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        className="text-center text-2xl font-mono tracking-widest"
                      />
                    </div>

                    <Button
                      onClick={handleVerify}
                      disabled={verifying || verificationCode.length !== 6}
                      className="w-full"
                    >
                      {verifying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        'Verify and Enable'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
