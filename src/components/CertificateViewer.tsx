import { ArrowLeft, Download, Shield, CheckCircle2, QrCode, Calendar, User, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface CertificateViewerProps {
  onBack: () => void;
}

export const CertificateViewer = ({ onBack }: CertificateViewerProps) => {
  const jobId = `SE-${Date.now().toString().slice(-8)}`;
  const verificationToken = `VT-${Math.random().toString(36).substr(2, 12).toUpperCase()}`;
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <Button className="bg-gradient-primary hover:opacity-90">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      <Card className="max-w-4xl mx-auto">
        <CardHeader className="text-center space-y-4 bg-gradient-security rounded-t-lg">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 ring-4 ring-success/10">
              <Shield className="h-8 w-8 text-success" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl text-foreground">Secure Erasure Certificate</CardTitle>
            <CardDescription className="text-muted-foreground">
              Official verification of data sanitization compliance
            </CardDescription>
          </div>
          <Badge className="bg-success text-success-foreground">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Verified & Compliant
          </Badge>
        </CardHeader>

        <CardContent className="space-y-8 p-8">
          {/* Certificate Details */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-4 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-primary" />
                  Job Information
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Job ID:</span>
                    <span className="font-mono">{jobId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date & Time:</span>
                    <span>{new Date().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration:</span>
                    <span>2 minutes 34 seconds</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Operator:</span>
                    <span>System Administrator</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4 flex items-center">
                  <User className="h-4 w-4 mr-2 text-primary" />
                  Authorization
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Organization:</span>
                    <span>Enterprise Bank Corp</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Department:</span>
                    <span>IT Security</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Policy:</span>
                    <span>DOD 5220.22-M</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Compliance:</span>
                    <Badge variant="outline" className="text-success border-success/20">
                      NIST 800-88 Rev. 1
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-4 flex items-center">
                  <HardDrive className="h-4 w-4 mr-2 text-primary" />
                  Device Details
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device:</span>
                    <span>Kingston DataTraveler</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Serial Number:</span>
                    <span className="font-mono">DT101G2-32GB-2024</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capacity:</span>
                    <span>32 GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interface:</span>
                    <span>USB 3.0</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4 flex items-center">
                  <QrCode className="h-4 w-4 mr-2 text-primary" />
                  Verification
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Token:</span>
                    <span className="font-mono text-xs">{verificationToken}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hash:</span>
                    <span className="font-mono text-xs">SHA256:a7b2c...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Server:</span>
                    <span>audit.shredsafe.com</span>
                  </div>
                </div>
                
                {/* QR Code placeholder */}
                <div className="mt-4 flex justify-center">
                  <div className="h-24 w-24 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border">
                    <QrCode className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Technical Details */}
          <div>
            <h3 className="font-semibold mb-4">Sanitization Summary</h3>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Method:</span>
                  <p className="font-medium">Multi-Pass Overwrite (DoD 5220.22-M)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Passes:</span>
                  <p className="font-medium">3-Pass (Random, Complement, Random)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Verification:</span>
                  <p className="font-medium text-success">100% Sectors Verified</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Free Space:</span>
                  <p className="font-medium text-success">Wiped & Verified</p>
                </div>
              </div>
              
              <div className="pt-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  <strong>Certificate Authenticity:</strong> This certificate is digitally signed and can be verified 
                  at audit.shredsafe.com using the verification token above. The erasure process meets or exceeds 
                  NIST SP 800-88 Rev. 1 guidelines for secure media sanitization.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Generated by ShredSafe Enterprise v2.1.0 • Licensed to Enterprise Bank Corp<br />
              This certificate serves as proof of authorized data sanitization • Retain for compliance records
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};