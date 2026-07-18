const MorbidCaseAIService = require('../../services/MorbidCaseAIService');

function validAnalysis() {
  return {
    case_overview: {
      headline: 'Perjalanan klinis dengan risiko tinggi', clinical_summary: 'Ringkasan', primary_problem: 'Preeklamsia',
      comorbidities: [], outcome: 'pulang', outcome_context: 'Pasien pulang, tetapi tetap terdapat titik pembelajaran.',
      severity_level: 'tinggi', confidence: 'tinggi',
    },
    executive_analysis: {
      problem_representation: 'Representasi', disease_course: 'Perjalanan', management_appraisal: 'Appraisal', overall_judgement: 'Penilaian',
    },
    critical_points: [{
      sequence: 1, occurred_at: '2026-07-12', phase: 'Praoperatif', title: 'Hipertensi berat', category: 'recognition',
      severity: 4, direction: 'membantu', evidence: 'Tekanan darah tercatat tinggi', clinical_significance: 'Risiko maternal',
      action_taken: 'Monitoring', alternative_or_learning: 'Perkuat eskalasi', preventability: 'tidak_berlaku', confidence: 'tinggi',
    }],
    clinical_timeline: [{ occurred_at: '2026-07-12', label: 'Masuk', phase: 'Awal', clinical_state: 'Berisiko', severity: 4, evidence: 'CPPT', intervention: 'Monitoring', response: 'Stabil' }],
    care_quality: { overall_score: 80, interpretation: 'Baik', dimensions: [] },
    causal_analysis: { synthesis: 'Multifaktor', patient_factors: [], disease_factors: [], task_process_factors: [], team_factors: [], environment_system_factors: [], protective_factors: [] },
    what_went_well: [], improvement_opportunities: [],
    action_plan: { immediate: [], short_term: [], system_level: [] },
    conclusion: { overall_assessment: 'Kesimpulan', key_learning: 'Pembelajaran', mortality_independent_note: 'Tidak bergantung kematian', limitations: [], unanswered_questions: [] },
  };
}

describe('MorbidCaseAIService', () => {
  test('uses GPT-5.6 Sol High Responses structured output without storing provider data', async () => {
    const create = jest.fn(async () => ({
      id: 'resp_test', model: 'gpt-5.6-sol', output_text: JSON.stringify(validAnalysis()),
      usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
    }));
    const service = new MorbidCaseAIService({ client: { responses: { create } } });

    const result = await service.analyze({ cppt: [{ author: 'Dokter A', assessment: 'Preeklamsia' }] }, { patient_name: 'PASIEN A', mr_id: '12345', case_id: 'med1' }, 'user-1');

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-sol', reasoning: { effort: 'high' }, store: false,
      text: expect.objectContaining({ verbosity: 'high', format: expect.objectContaining({ type: 'json_schema', strict: true }) }),
    }), { timeout: 600000 });
    expect(result).toEqual(expect.objectContaining({ model: 'gpt-5.6-sol', reasoning_effort: 'high', response_id: 'resp_test' }));
  });

  test('removes direct identifiers and staff authors while preserving clinical names', () => {
    const result = MorbidCaseAIService.deidentifySnapshot({
      overview: { patient_name: 'PASIEN A', dpjp_name: 'DOKTER X' },
      cppt: [{ author: 'DOKTER X', assessment: 'PASIEN A mengalami preeklamsia' }],
      penunjang: { results: [{ name: 'Hemoglobin', value: '10' }], files: [{ url: '/secret.pdf' }] },
    }, { patient_name: 'PASIEN A', mr_id: '12345', case_id: 'med1' });

    expect(result.overview).toEqual({});
    expect(result.cppt[0]).toEqual({ assessment: '[IDENTITAS DIHAPUS] mengalami preeklamsia' });
    expect(result.penunjang.results[0].name).toBe('Hemoglobin');
    expect(result.penunjang.files).toBeUndefined();
  });
});
