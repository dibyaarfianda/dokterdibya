'use strict';

class AssistantDafContextService {
  constructor({ key = process.env.ASSISTANT_DAF_CONTEXT_KEY, fetchImpl = fetch } = {}) {
    this.key = key;
    this.fetch = fetchImpl;
  }
  async patient(facility, mr) {
    if (!this.key) throw Object.assign(new Error('Pemeriksaan identitas COMM belum dikonfigurasi'), { statusCode: 503 });
    try {
      const response = await this.fetch('http://127.0.0.1:3002/api/assistant-context/patient', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(47000),
        headers: { 'content-type': 'application/json', 'x-assistant-key': this.key },
        body: JSON.stringify({ facility, mr })
      });
      if (!response.ok) throw Object.assign(new Error(response.status === 422
        ? 'Nomor RM belum ditemukan secara unik di fasilitas ini. Periksa nomor RM lengkap.'
        : 'Pemeriksaan identitas COMM tidak tersedia. Jadwal belum diubah.'), { statusCode: response.status === 422 ? 422 : 503 });
      const { patient } = await response.json();
      if (!patient?.id || !patient.full_name || patient.facility !== facility || patient.hospital_mr_id !== mr) throw new Error('invalid');
      return { id: String(patient.id), full_name: String(patient.full_name), facility, hospital_mr_id: mr };
    } catch (error) {
      if (error.statusCode) throw error;
      throw Object.assign(new Error('Pemeriksaan identitas COMM tidak tersedia. Jadwal belum diubah.'), { statusCode: 503 });
    }
  }
}
module.exports = AssistantDafContextService;
