export interface DiscoveryInfo {
  instanceId: string;
  instanceName: string;
  organization: string;
  version: string;
  apiVersion: number;
  serverTime: string;
  supportsMobile: true;
}

export interface DiscoveryTxtRecords {
  instanceId: string;
  instanceName: string;
  version: string;
  apiVersion: string;
  organization: string;
  https: string;
  host?: string;
  port?: string;
}
