import { useState, useEffect, useCallback } from 'react';

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

interface ErasureProgress {
  type: 'started' | 'progress' | 'complete' | 'error';
  jobId: string;
  operation?: string;
  progress?: number;
  message?: string;
  device?: string;
}

interface TokenValidation {
  valid: boolean;
  reason?: string;
  tokenType?: string;
  remainingUses?: number;
  expiresAt?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      getDevices: () => Promise<{ success: boolean; devices: Device[] }>;
      startErasure: (device: Device, token: string) => Promise<any>;
      connectWebSocket: (
        onMessage: (event: MessageEvent) => void,
        onError: (event: Event) => void,
        onClose: (event: CloseEvent) => void
      ) => WebSocket;
      validateToken: (token: string) => Promise<TokenValidation>;
      getLicenseInfo: () => Promise<any>;
      platform: string;
      isWindows: boolean;
      isMacOS: boolean;
      isLinux: boolean;
    };
  }
}

export const useElectron = () => {
  const [isElectron, setIsElectron] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erasureProgress, setErasureProgress] = useState<ErasureProgress | null>(null);
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    setIsElectron(!!window.electronAPI);
  }, []);

  const connectToProgress = useCallback(() => {
    if (!window.electronAPI || websocket) return;

    const ws = window.electronAPI.connectWebSocket(
      (event) => {
        try {
          const data = JSON.parse(event.data);
          setErasureProgress(data);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      },
      (event) => {
        console.error('WebSocket error:', event);
        setError('Connection to backend lost');
      },
      (event) => {
        console.log('WebSocket closed:', event);
        setWebsocket(null);
      }
    );

    setWebsocket(ws);
  }, [websocket]);

  const disconnectFromProgress = useCallback(() => {
    if (websocket) {
      websocket.close();
      setWebsocket(null);
    }
  }, [websocket]);

  const fetchDevices = useCallback(async () => {
    if (!window.electronAPI) {
      // Fallback to mock data for web version
      setDevices([
        {
          id: "web-mock-001",
          name: "Web Demo Device",
          type: "removable",
          size: "32 GB",
          status: "ready",
          serialNumber: "WEB-MOCK-001",
          fileSystem: "FAT32",
          encryption: false
        }
      ]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getDevices();
      if (result.success) {
        setDevices(result.devices);
      } else {
        throw new Error('Failed to fetch devices');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const validateToken = useCallback(async (token: string): Promise<TokenValidation> => {
    if (!window.electronAPI) {
      // Mock validation for web version
      return {
        valid: token.startsWith('demo-'),
        reason: token.startsWith('demo-') ? undefined : 'Invalid token format',
        tokenType: 'single-use',
        remainingUses: 1
      };
    }

    try {
      return await window.electronAPI.validateToken(token);
    } catch (err) {
      return {
        valid: false,
        reason: 'Failed to validate token'
      };
    }
  }, []);

  const startErasure = useCallback(async (device: Device, token: string) => {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      const result = await window.electronAPI.startErasure(device, token);
      return result;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to start erasure');
    }
  }, []);

  const getLicenseInfo = useCallback(async () => {
    if (!window.electronAPI) {
      return {
        type: 'web-demo',
        remainingTokens: 'unlimited',
        features: ['demo-mode']
      };
    }

    try {
      return await window.electronAPI.getLicenseInfo();
    } catch (err) {
      throw new Error('Failed to get license info');
    }
  }, []);

  const getPlatformInfo = useCallback(() => {
    if (!window.electronAPI) {
      return {
        platform: 'web',
        isWindows: false,
        isMacOS: false,
        isLinux: false,
        isWeb: true
      };
    }

    return {
      platform: window.electronAPI.platform,
      isWindows: window.electronAPI.isWindows,
      isMacOS: window.electronAPI.isMacOS,
      isLinux: window.electronAPI.isLinux,
      isWeb: false
    };
  }, []);

  // Auto-connect to WebSocket when component mounts
  useEffect(() => {
    if (isElectron) {
      connectToProgress();
    }

    return () => {
      disconnectFromProgress();
    };
  }, [isElectron, connectToProgress, disconnectFromProgress]);

  return {
    isElectron,
    devices,
    loading,
    error,
    erasureProgress,
    fetchDevices,
    validateToken,
    startErasure,
    getLicenseInfo,
    getPlatformInfo,
    connectToProgress,
    disconnectFromProgress,
    clearProgress: () => setErasureProgress(null),
    clearError: () => setError(null)
  };
};