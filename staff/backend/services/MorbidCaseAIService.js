const crypto = require('crypto');
const OpenAI = require('openai');

const DEFAULT_MODEL = 'gpt-5.6-sol';
const DEFAULT_REASONING_EFFORT = 'high';

const string = (extra = {}) => ({ type: 'string', ...extra });
const number = (extra = {}) => ({ type: 'number', ...extra });
const integer = (extra = {}) => ({ type: 'integer', ...extra });
const array = (items, extra = {}) => ({ type: 'array', items, ...extra });
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

const confidence = string({ enum: ['tinggi', 'sedang', 'rendah'] });

const MORBID_CASE_ANALYSIS_SCHEMA = object({
  case_overview: object({
    headline: string(),
    clinical_summary: string(),
    primary_problem: string(),
    comorbidities: array(string()),
    outcome: string({ enum: ['pulang', 'masih_dirawat', 'rujuk', 'meninggal', 'tidak_diketahui'] }),
    outcome_context: string(),
    severity_level: string({ enum: ['rendah', 'sedang', 'tinggi', 'kritis'] }),
    confidence,
  }),
  executive_analysis: object({
    problem_representation: string(),
    disease_course: string(),
    management_appraisal: string(),
    overall_judgement: string(),
  }),
  critical_points: array(object({
    sequence: integer({ minimum: 1 }),
    occurred_at: string(),
    phase: string(),
    title: string(),
    category: string({ enum: ['recognition', 'diagnosis', 'treatment', 'monitoring', 'handoff', 'safety', 'documentation', 'outcome'] }),
    severity: integer({ minimum: 1, maximum: 5 }),
    direction: string({ enum: ['membantu', 'merugikan', 'netral', 'tidak_pasti'] }),
    evidence: string(),
    clinical_significance: string(),
    action_taken: string(),
    alternative_or_learning: string(),
    preventability: string({ enum: ['dapat_dicegah', 'mungkin_dapat_dicegah', 'tidak_dapat_dicegah', 'tidak_berlaku', 'tidak_pasti'] }),
    confidence,
  }), { minItems: 1 }),
  clinical_timeline: array(object({
    occurred_at: string(),
    label: string(),
    phase: string(),
    clinical_state: string(),
    severity: integer({ minimum: 0, maximum: 5 }),
    evidence: string(),
    intervention: string(),
    response: string(),
  })),
  care_quality: object({
    overall_score: integer({ minimum: 0, maximum: 100 }),
    interpretation: string(),
    dimensions: array(object({
      dimension: string({ enum: ['Pengenalan Masalah', 'Diagnosis', 'Tatalaksana', 'Monitoring', 'Komunikasi & Handover', 'Dokumentasi'] }),
      score: integer({ minimum: 0, maximum: 100 }),
      rationale: string(),
    })),
  }),
  causal_analysis: object({
    synthesis: string(),
    patient_factors: array(string()),
    disease_factors: array(string()),
    task_process_factors: array(string()),
    team_factors: array(string()),
    environment_system_factors: array(string()),
    protective_factors: array(string()),
  }),
  what_went_well: array(object({
    title: string(),
    evidence: string(),
    impact: string(),
  })),
  improvement_opportunities: array(object({
    priority: string({ enum: ['tinggi', 'sedang', 'rendah'] }),
    issue: string(),
    evidence: string(),
    recommendation: string(),
    success_metric: string(),
  })),
  action_plan: object({
    immediate: array(string()),
    short_term: array(string()),
    system_level: array(string()),
  }),
  conclusion: object({
    overall_assessment: string(),
    key_learning: string(),
    mortality_independent_note: string(),
    limitations: array(string()),
    unanswered_questions: array(string()),
  }),
});

const OMITTED_KEYS = /^(?:_token|csrf(?:_token)?|token|password|cookie|authorization|patient_name|nama_pasien|mr_id|no_rm|case_id|nik|address|alamat|phone|telepon|email|author|petugas|doctor_name|dpjp_name|created_by|user_id|url|source_key|r2_key|r2_bucket|operation_r2_key|operation_r2_bucket|id|resepId|operation_id)$/i;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deidentifySnapshot(snapshot, catalog = {}) {
  const directIdentifiers = [catalog.patient_name, catalog.mr_id, catalog.case_id]
    .map(value => String(value || '').trim())
    .filter(value => value.length >= 3);

  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') {
      if (typeof value !== 'string') return value;
      return directIdentifiers.reduce(
        (text, identifier) => text.replace(new RegExp(escapeRegExp(identifier), 'gi'), '[IDENTITAS DIHAPUS]'),
        value
      );
    }
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (OMITTED_KEYS.test(key)) continue;
      if (key === 'files' || key === 'operation_archive') continue;
      output[key] = walk(child);
    }
    return output;
  };

  return walk(snapshot);
}

function validateAnalysis(value) {
  if (!value || typeof value !== 'object') throw new Error('Respons AI tidak berbentuk objek');
  if (!value.case_overview || !value.executive_analysis || !value.conclusion) throw new Error('Respons AI tidak lengkap');
  if (!Array.isArray(value.critical_points) || value.critical_points.length === 0) throw new Error('Respons AI tidak memuat critical point');
  if (!Array.isArray(value.clinical_timeline) || !value.care_quality) throw new Error('Respons AI tidak memuat data visualisasi');
  return value;
}

class MorbidCaseAIService {
  constructor({
    client = null,
    apiKey = process.env.OPENAI_API_KEY || '',
    model = process.env.MORBID_CASE_AI_MODEL || DEFAULT_MODEL,
    reasoningEffort = process.env.MORBID_CASE_AI_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
  } = {}) {
    this.client = client;
    this.apiKey = apiKey;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
  }

  getClient() {
    if (this.client) return this.client;
    if (!this.apiKey) {
      const error = new Error('OPENAI_API_KEY belum dikonfigurasi untuk analisis Morbid Case');
      error.status = 503;
      throw error;
    }
    this.client = new OpenAI({ apiKey: this.apiKey, timeout: 600000, maxRetries: 2 });
    return this.client;
  }

  async analyze(snapshot, catalog, requestedBy) {
    const clinicalData = deidentifySnapshot(snapshot, catalog);
    const stableUser = crypto.createHash('sha256').update(String(requestedBy || 'docboard-morbid-case')).digest('hex');
    const response = await this.getClient().responses.create({
      model: this.model,
      reasoning: { effort: this.reasoningEffort },
      store: false,
      safety_identifier: stableUser,
      max_output_tokens: 48000,
      instructions: [
        'Anda adalah reviewer klinis senior untuk konferensi morbiditas dan peningkatan mutu layanan.',
        'Analisis episode perawatan secara mendalam dalam Bahasa Indonesia berdasarkan data yang diberikan saja.',
        'Morbid Case tidak berarti pasien meninggal. Tetap identifikasi critical point, perubahan risiko, keputusan penting, respons terapi, faktor protektif, serta peluang perbaikan walaupun pasien hidup atau pulang.',
        'Pisahkan fakta dari inferensi. Jangan mengarang temuan, diagnosis, waktu, atau kausalitas. Bila data tidak cukup, tulis keterbatasan dan turunkan confidence.',
        'Gunakan critical point untuk kejadian yang mengubah risiko, arah diagnosis, tatalaksana, monitoring, handover, keselamatan, atau luaran—baik positif maupun negatif.',
        'Nilai preventability secara non-blaming dan berbasis bukti. Jangan menyimpulkan malpraktik atau kelalaian.',
        'Susun timeline yang representatif untuk grafik dengan skala severity 0 (stabil) sampai 5 (kritis).',
        'Skor mutu 0-100 adalah alat refleksi internal, bukan skor legal atau akreditasi. Jelaskan alasan tiap skor.',
        'Rekomendasi harus spesifik, realistis, dapat ditindaklanjuti, dan memiliki metrik keberhasilan.',
        'Output wajib mengikuti JSON schema tanpa Markdown.',
      ].join('\n'),
      input: `DATA KLINIS TERDEIDENTIFIKASI:\n${JSON.stringify(clinicalData)}`,
      text: {
        verbosity: 'high',
        format: {
          type: 'json_schema',
          name: 'morbid_case_analysis',
          description: 'Analisis klinis terstruktur untuk review Morbid Case dan visualisasi.',
          strict: true,
          schema: MORBID_CASE_ANALYSIS_SCHEMA,
        },
      },
      metadata: { feature: 'docboard_morbid_case_analysis' },
    }, { timeout: 600000 });

    if (!response.output_text) throw new Error('OpenAI tidak mengembalikan hasil analisis');
    let parsed;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      throw new Error('Hasil analisis OpenAI tidak dapat dibaca sebagai JSON');
    }

    return {
      ...validateAnalysis(parsed),
      generated_at: new Date().toISOString(),
      model: response.model || this.model,
      reasoning_effort: this.reasoningEffort,
      response_id: response.id || null,
      usage: response.usage ? {
        input_tokens: Number(response.usage.input_tokens || 0),
        output_tokens: Number(response.usage.output_tokens || 0),
        total_tokens: Number(response.usage.total_tokens || 0),
      } : null,
    };
  }
}

MorbidCaseAIService.deidentifySnapshot = deidentifySnapshot;
MorbidCaseAIService.analysisSchema = MORBID_CASE_ANALYSIS_SCHEMA;
MorbidCaseAIService.DEFAULT_MODEL = DEFAULT_MODEL;
MorbidCaseAIService.DEFAULT_REASONING_EFFORT = DEFAULT_REASONING_EFFORT;

module.exports = MorbidCaseAIService;
