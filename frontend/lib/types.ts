export interface AnalysisResult {
  status: "success" | "error";
  prediction: "Normal" | "Pneumonia";
  model_score: number;
  is_uncertain: boolean;
  risk_level: string;
  heatmap_base64: string | null;
  original_base64?: string | null;
  model_loaded?: boolean;
  message?: string;
}

export interface Hospital {
  id: string;
  name: string;
  type: "Government" | "Private" | "PHC" | "CHC";
  address: string;
  district: string;
  state: string;
  pincode: string;
  lat?: number;
  lon?: number;
  departments: string[];
  contact?: string;
  has_xray: boolean;
  has_ct: boolean;
  is_demo: boolean;
  last_verified: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  qualifications: string[];
  hospital_id: string;
  hospital_name: string;
  district: string;
  languages: string[];
  is_demo: boolean;
  last_verified: string;
}

export interface ModelStatus {
  model_loaded: boolean;
  architecture: string;
  classes: string[];
  checkpoint_path: string;
  torch_version: string;
}
