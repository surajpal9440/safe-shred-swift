import { useState } from "react";
import { ArrowLeft, CreditCard, Plus, Calendar, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TokenManagerProps {
  onBack: () => void;
}

interface Token {
  id: string;
  type: 'single-use' | 'pack' | 'enterprise';
  status: 'active' | 'used' | 'expired';
  credits: number;
  usedCredits: number;
  expiryDate: string;
  purchaseDate: string;
}

export const TokenManager = ({ onBack }: TokenManagerProps) => {
  const [tokens] = useState<Token[]>([
    {
      id: 'TK-ENT-2024-001',
      type: 'enterprise',
      status: 'active',
      credits: 1000,
      usedCredits: 247,
      expiryDate: '2024-12-31',
      purchaseDate: '2024-01-15'
    },
    {
      id: 'TK-PCK-2024-002',
      type: 'pack',
      status: 'active', 
      credits: 50,
      usedCredits: 12,
      expiryDate: '2024-10-15',
      purchaseDate: '2024-09-15'
    },
    {
      id: 'TK-SNG-2024-003',
      type: 'single-use',
      status: 'used',
      credits: 1,
      usedCredits: 1,
      expiryDate: '2024-09-20',
      purchaseDate: '2024-09-19'
    }
  ]);

  const [newTokenCode, setNewTokenCode] = useState('');

  const getTokenTypeLabel = (type: string) => {
    switch (type) {
      case 'single-use': return 'Single Use';
      case 'pack': return 'Credit Pack';
      case 'enterprise': return 'Enterprise';
      default: return type;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return CheckCircle2;
      case 'used': return XCircle;
      case 'expired': return Clock;
      default: return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'used': return 'secondary';
      case 'expired': return 'destructive';
      default: return 'secondary';
    }
  };

  const totalCredits = tokens.reduce((acc, token) => acc + token.credits, 0);
  const usedCredits = tokens.reduce((acc, token) => acc + token.usedCredits, 0);
  const remainingCredits = totalCredits - usedCredits;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Credits Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center space-x-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{remainingCredits}</p>
              <p className="text-sm text-muted-foreground">Available Credits</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center space-x-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usedCredits}</p>
              <p className="text-sm text-muted-foreground">Credits Used</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center space-x-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
              <Calendar className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{tokens.filter(t => t.status === 'active').length}</p>
              <p className="text-sm text-muted-foreground">Active Tokens</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tokens" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tokens">Token Management</TabsTrigger>
          <TabsTrigger value="activate">Activate New Token</TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Tokens</CardTitle>
              <CardDescription>
                Manage your ShredSafe licenses and credit packs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tokens.map((token) => {
                const StatusIcon = getStatusIcon(token.status);
                const remainingTokenCredits = token.credits - token.usedCredits;
                
                return (
                  <Card key={token.id} className="transition-all hover:shadow-soft">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center space-x-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                          token.type === 'enterprise' ? 'bg-primary/10' :
                          token.type === 'pack' ? 'bg-accent/10' : 'bg-muted'
                        }`}>
                          <CreditCard className={`h-6 w-6 ${
                            token.type === 'enterprise' ? 'text-primary' :
                            token.type === 'pack' ? 'text-accent' : 'text-muted-foreground'
                          }`} />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-medium">{token.id}</h4>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">
                              {getTokenTypeLabel(token.type)}
                            </Badge>
                            <Badge variant={getStatusColor(token.status)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {token.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>Credits: {remainingTokenCredits} / {token.credits} remaining</p>
                            <p>Expires: {new Date(token.expiryDate).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="w-24 bg-muted rounded-full h-2 mb-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${(remainingTokenCredits / token.credits) * 100}%` }}
                          />
                        </div>
                        <p className="text-sm font-medium">
                          {Math.round((remainingTokenCredits / token.credits) * 100)}%
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Activate New Token</CardTitle>
              <CardDescription>
                Enter your token code to activate additional credits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="token-code">Token Code</Label>
                <Input
                  id="token-code"
                  value={newTokenCode}
                  onChange={(e) => setNewTokenCode(e.target.value)}
                  placeholder="Enter your token code (e.g., TK-ABC-123-XYZ)"
                  className="font-mono"
                />
              </div>

              <Button 
                className="w-full bg-gradient-primary hover:opacity-90"
                disabled={!newTokenCode.trim()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Activate Token
              </Button>

              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="font-medium mb-2">Token Types</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>Single-Use:</strong> One erasure operation, expires after use or 30 days</p>
                  <p><strong>Credit Pack:</strong> 10-100 credits, valid for 6 months</p>
                  <p><strong>Enterprise:</strong> Unlimited credits, annual subscription with audit features</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};