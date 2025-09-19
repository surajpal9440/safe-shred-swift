import { useState } from "react";
import { Shield, HardDrive, Smartphone, Laptop, AlertTriangle, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DevicesList } from "@/components/DevicesList";
import { EraseWorkflow } from "@/components/EraseWorkflow";
import { CertificateViewer } from "@/components/CertificateViewer";
import { TokenManager } from "@/components/TokenManager";

const Index = () => {
  const [activeView, setActiveView] = useState<'dashboard' | 'workflow' | 'certificate' | 'tokens'>('dashboard');
  const [selectedDevice, setSelectedDevice] = useState<any>(null);

  return (
    <div className="min-h-screen bg-gradient-security">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">ShredSafe</h1>
              <p className="text-xs text-muted-foreground">Enterprise Secure Erasure</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              <Award className="h-3 w-3 mr-1" />
              Licensed
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setActiveView('tokens')}
            >
              Manage Tokens
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {activeView === 'dashboard' && (
          <div className="space-y-8">
            {/* Warning Banner */}
            <Card className="border-warning/20 bg-warning/5">
              <CardContent className="flex items-start space-x-3 pt-6">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-warning">
                    You confirm you are authorized to erase this device. This action is permanent.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ShredSafe will remove local data and attempt to wipe residual data; cloud backups and copies are not affected unless you explicitly delete them.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="group cursor-pointer transition-all hover:shadow-primary border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <HardDrive className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Removable Media</CardTitle>
                      <CardDescription>USB drives, SD cards, external HDDs</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Crypto-erase recommended for flash media due to wear-leveling
                  </p>
                  <Button className="w-full bg-gradient-primary hover:opacity-90">
                    Scan Removable Devices
                  </Button>
                </CardContent>
              </Card>

              <Card className="group cursor-pointer transition-all hover:shadow-primary border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                      <Laptop className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Clean This PC</CardTitle>
                      <CardDescription>System cleanup & residual data</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Browser caches, temp files, system artifacts
                  </p>
                  <Button variant="secondary" className="w-full">
                    Start PC Cleanup
                  </Button>
                </CardContent>
              </Card>

              <Card className="group cursor-pointer transition-all hover:shadow-primary border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                      <Smartphone className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Mobile Devices</CardTitle>
                      <CardDescription>Android/iOS connected devices</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    iOS deep-clean limited by Apple security
                  </p>
                  <Button variant="outline" className="w-full">
                    Detect Mobile Devices
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Devices List */}
            <DevicesList onDeviceSelect={(device) => {
              setSelectedDevice(device);
              setActiveView('workflow');
            }} />
          </div>
        )}

        {activeView === 'workflow' && (
          <EraseWorkflow 
            device={selectedDevice}
            onBack={() => setActiveView('dashboard')}
            onComplete={(certificate) => {
              setActiveView('certificate');
            }}
          />
        )}

        {activeView === 'certificate' && (
          <CertificateViewer onBack={() => setActiveView('dashboard')} />
        )}

        {activeView === 'tokens' && (
          <TokenManager onBack={() => setActiveView('dashboard')} />
        )}
      </main>
    </div>
  );
};

export default Index;