import { useState } from "react";
import { ArrowLeft, AlertTriangle, Shield, Zap, CheckCircle2, FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EraseWorkflowProps {
  device: any;
  onBack: () => void;
  onComplete: (certificate: any) => void;
}

export const EraseWorkflow = ({ device, onBack, onComplete }: EraseWorkflowProps) => {
  const [step, setStep] = useState<'confirm' | 'progress' | 'complete'>('confirm');
  const [confirmText, setConfirmText] = useState('');
  const [confirmYes, setConfirmYes] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState('');

  const requiredConfirmText = device?.type === 'removable' ? device.id.split('-')[1] : 'THIS-PC';
  
  const startErasure = async () => {
    setStep('progress');
    
    const operations = [
      'Requesting administrative privileges...',
      'Analyzing device structure...',
      'Identifying erasure method...',
      'Beginning secure overwrite...',
      'Wiping free space...',
      'Verifying erasure completion...',
      'Generating audit log...',
      'Creating certificate...'
    ];

    for (let i = 0; i < operations.length; i++) {
      setCurrentOperation(operations[i]);
      setProgress(((i + 1) / operations.length) * 100);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setStep('complete');
  };

  const isConfirmationValid = () => {
    return confirmText.toLowerCase() === requiredConfirmText.toLowerCase() && 
           confirmYes.toLowerCase() === 'yes';
  };

  if (step === 'confirm') {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span>Confirm Secure Erasure</span>
            </CardTitle>
            <CardDescription>
              You are about to permanently erase: <strong>{device?.name}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Device Details */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Device:</span>
                  <span className="font-medium">{device?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Serial Number:</span>
                  <span className="font-mono">{device?.serialNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span>{device?.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <Badge variant="outline">
                    {device?.encryption ? 'Crypto-Erase' : 'Multi-Pass Overwrite'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Warnings */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>This action cannot be undone.</strong> All data on this device will be permanently destroyed. 
                Cloud backups and copies on other devices are not affected.
              </AlertDescription>
            </Alert>

            {device?.type === 'removable' && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  <strong>Flash Media Notice:</strong> Crypto-erase is recommended for USB/flash media due to wear-leveling. 
                  Overwrites may not clear every physical cell.
                </AlertDescription>
              </Alert>
            )}

            {/* Confirmation Inputs */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-device">
                  Type device identifier to confirm: <code className="text-primary">{requiredConfirmText}</code>
                </Label>
                <Input
                  id="confirm-device"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Type "${requiredConfirmText}"`}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-yes">
                  Type <code className="text-primary">YES</code> to confirm you are authorized
                </Label>
                <Input
                  id="confirm-yes"
                  value={confirmYes}
                  onChange={(e) => setConfirmYes(e.target.value)}
                  placeholder="Type YES"
                  className="font-mono"
                />
              </div>
            </div>

            <Button 
              onClick={startErasure}
              disabled={!isConfirmationValid()}
              className="w-full bg-gradient-primary hover:opacity-90"
              size="lg"
            >
              <Zap className="h-4 w-4 mr-2" />
              Begin Secure Erasure
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'progress') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
              <span>Erasure in Progress</span>
            </CardTitle>
            <CardDescription>
              Please do not disconnect the device or close this application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground">{currentOperation}</p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="font-medium mb-2">Current Operation Details</h4>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Device: {device?.name}</p>
                <p>Method: {device?.encryption ? 'AES-256 Key Destruction' : 'DoD 5220.22-M (3-Pass)'}</p>
                <p>Estimated time: {device?.encryption ? '< 1 minute' : '15-45 minutes'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-success/20 bg-success/5">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <span>Erasure Complete</span>
          </CardTitle>
          <CardDescription>
            Device has been successfully and securely erased
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-background/50 p-4">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Job ID:</span>
                <span className="font-mono">SE-{Date.now().toString().slice(-8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed:</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span>{device?.encryption ? 'Crypto-Erase (AES-256)' : 'Multi-Pass Overwrite'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Verification:</span>
                <Badge variant="outline" className="text-success border-success/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Passed
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <Button 
              onClick={() => onComplete({})}
              className="flex-1 bg-gradient-primary hover:opacity-90"
            >
              <FileX className="h-4 w-4 mr-2" />
              Generate Certificate
            </Button>
            <Button variant="outline" onClick={onBack}>
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};