import { useState, useEffect } from "react";
import { HardDrive, Smartphone, Laptop, Shield, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useElectron } from "@/hooks/useElectron";

interface Device {
  id: string;
  name: string;
  type: 'removable' | 'internal' | 'mobile';
  size: string;
  status: 'ready' | 'protected' | 'system';
  serialNumber: string;
  fileSystem?: string;
  encryption?: boolean;
  driveLetter?: string;
}

interface DevicesListProps {
  onDeviceSelect: (device: Device) => void;
}

export const DevicesList = ({ onDeviceSelect }: DevicesListProps) => {
  const { devices, loading, error, fetchDevices, isElectron, getPlatformInfo } = useElectron();
  const [localScanning, setLocalScanning] = useState(false);
  const platformInfo = getPlatformInfo();

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const scanDevices = async () => {
    setLocalScanning(true);
    await fetchDevices();
    setLocalScanning(false);
  };

  const scanning = loading || localScanning;

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'removable': return HardDrive;
      case 'mobile': return Smartphone;
      case 'internal': return Laptop;
      default: return HardDrive;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'success';
      case 'protected': return 'warning';
      case 'system': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready': return CheckCircle2;
      case 'protected': return Shield;
      case 'system': return AlertCircle;
      default: return AlertCircle;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Detected Devices</CardTitle>
            <CardDescription>
              Select a device to begin secure erasure process
              {!isElectron && " (Web Demo Mode)"}
              {isElectron && ` (${platformInfo.platform})`}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            onClick={scanDevices}
            disabled={scanning}
          >
            {scanning ? "Scanning..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-center py-4">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-2" onClick={scanDevices}>
              Try Again
            </Button>
          </div>
        )}
        
        {scanning ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
              <p className="text-sm text-muted-foreground">
                {isElectron ? "Scanning for devices..." : "Loading demo devices..."}
              </p>
            </div>
          </div>
        ) : (
          devices.map((device) => {
            const Icon = getDeviceIcon(device.type);
            const StatusIcon = getStatusIcon(device.status);
            
            return (
              <Card 
                key={device.id} 
                className={`transition-all hover:shadow-soft cursor-pointer ${
                  device.status === 'ready' 
                    ? 'hover:border-primary/50' 
                    : device.status === 'system' 
                      ? 'opacity-50 cursor-not-allowed' 
                      : ''
                }`}
                onClick={() => device.status === 'ready' && onDeviceSelect(device)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                      device.type === 'removable' ? 'bg-primary/10' :
                      device.type === 'mobile' ? 'bg-warning/10' : 'bg-muted'
                    }`}>
                      <Icon className={`h-6 w-6 ${
                        device.type === 'removable' ? 'text-primary' :
                        device.type === 'mobile' ? 'text-warning' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-medium">{device.name}</h4>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <span>{device.size}</span>
                        {device.fileSystem && <span>• {device.fileSystem}</span>}
                        {device.encryption && (
                          <Badge variant="outline" className="text-xs">Encrypted</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Serial: {device.serialNumber}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Badge variant={getStatusColor(device.status)} className="capitalize">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {device.status === 'system' ? 'Protected' : device.status}
                    </Badge>
                    {device.status === 'ready' && (
                      <Button size="sm">
                        Select Device
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {!scanning && devices.length === 0 && (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No devices detected</p>
            <Button variant="outline" className="mt-4" onClick={scanDevices}>
              Scan Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};