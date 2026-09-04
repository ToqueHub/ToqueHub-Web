export type ArchitectureAlertLevel = 'information' | 'attention' | 'critique';

export interface ArchitectureField {
  name: string;
  type: string;
  required: boolean;
  isList: boolean;
  isId: boolean;
  isUnique: boolean;
  isRelation: boolean;
  attributes: string[];
}

export interface ArchitectureRelation {
  fromModel: string;
  fromTable: string;
  toModel: string;
  toTable: string;
  field: string;
  foreignKeys: string[];
  kind: 'relation' | 'ownership' | 'consumption' | 'dependency';
  onDelete?: string;
}

export interface ArchitectureModel {
  name: string;
  table: string;
  ownerModule: string;
  description: string;
  fields: ArchitectureField[];
  relations: ArchitectureRelation[];
  indexes: string[];
  uniqueConstraints: string[];
}

export interface ArchitectureModule {
  id: string;
  name: string;
  status: 'actif' | 'installé' | 'indisponible';
  description: string;
  ownedTables: string[];
  consumedTables: string[];
  consumerModules: string[];
  dependencies: string[];
}

export interface ArchitectureDataMapEntry {
  table: string;
  model: string;
  ownerModule: string;
  consumerModules: string[];
  description: string;
  confidence: 'élevé' | 'moyen' | 'faible';
  origin: string;
}

export interface ArchitectureDuplicateAlert {
  level: ArchitectureAlertLevel;
  source: string;
  target: string;
  message: string;
  signals: string[];
}

export interface ArchitectureImpact {
  moduleId: string;
  moduleName: string;
  ownedTables: string[];
  usedTables: string[];
  dependentModules: string[];
  impactedModules: string[];
  deactivationRisks: string[];
  criticalDependencies: string[];
}

export interface ArchitectureGraphNode {
  id: string;
  label: string;
  type: 'system' | 'module' | 'table' | 'entity';
  module?: string;
}

export interface ArchitectureGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'ownership' | 'consumption' | 'relation' | 'dependency';
  label: string;
}

export interface ArchitectureDocumentationPage {
  id: string;
  title: string;
  body: string[];
}

export interface ArchitectureAnalysis {
  generatedAt: string;
  summary: {
    modules: number;
    tables: number;
    relations: number;
    users: number;
    organizations: number;
    products: number;
    suppliers: number;
  };
  modules: ArchitectureModule[];
  dataMap: ArchitectureDataMapEntry[];
  relations: ArchitectureRelation[];
  schema: ArchitectureModel[];
  duplicateAlerts: ArchitectureDuplicateAlert[];
  impacts: ArchitectureImpact[];
  graph: { nodes: ArchitectureGraphNode[]; edges: ArchitectureGraphEdge[] };
  roadmap: Array<{ module: string; status: string; active: boolean; note: string }>;
  documentation: ArchitectureDocumentationPage[];
}
