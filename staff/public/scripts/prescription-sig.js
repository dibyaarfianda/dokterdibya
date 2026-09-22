// Shared prescription formatting. Does not infer or supply instructions.
(function(root) {
function toRoman(num) {
    const romanNumerals = [
        { value: 1000, numeral: 'M' },
        { value: 900, numeral: 'CM' },
        { value: 500, numeral: 'D' },
        { value: 400, numeral: 'CD' },
        { value: 100, numeral: 'C' },
        { value: 90, numeral: 'XC' },
        { value: 50, numeral: 'L' },
        { value: 40, numeral: 'XL' },
        { value: 10, numeral: 'X' },
        { value: 9, numeral: 'IX' },
        { value: 5, numeral: 'V' },
        { value: 4, numeral: 'IV' },
        { value: 1, numeral: 'I' }
    ];

    let result = '';
    let remaining = parseInt(num);

    for (const { value, numeral } of romanNumerals) {
        while (remaining >= value) {
            result += numeral;
            remaining -= value;
        }
    }

    return result;
}

// Convert Indonesian usage instructions to Latin abbreviations
function convertToLatinSig(caraPakai) {
    if (!caraPakai) return '';

    let latinSig = caraPakai.toLowerCase();
    let result = '';

    // Extract frequency pattern (e.g., "3x1", "2x2", "1x1")
    const frequencyMatch = latinSig.match(/(\d+)\s*x\s*(\d+)/);

    if (frequencyMatch) {
        const timesPerDay = frequencyMatch[1];
        const doseAmount = frequencyMatch[2];
        const doseRoman = toRoman(parseInt(doseAmount));

        // Frequency mapping
        const frequencyMap = {
            '1': 'd.d',           // tiap hari (daily)
            '2': 'b.d.d',         // dua kali sehari (twice daily)
            '3': 'ter.d.d',       // tiga kali sehari (three times daily)
            '4': 'q.d.d'          // empat kali sehari (four times daily)
        };

        const freqLatin = frequencyMap[timesPerDay] || `${timesPerDay} dd`;
        result = `${freqLatin} ${doseRoman}`;
    }

    // Timing/meal-related conversions
    const timingConversions = {
        'sebelum makan': 'a.c',
        'setelah makan': 'p.c',
        'pada saat makan': 'd.c',
        'saat makan': 'd.c',
        'dengan makan': 'd.c',
        'bila diperlukan': 'p.r.n',
        'bila perlu': 'p.r.n',
        'jika perlu': 'p.r.n',
        'pagi hari': 'h.m',
        'pagi': 'h.m',
        'malam hari': 'h.v',
        'malam': 'h.v',
        'sore': 'p.m',
        'sebelum tidur': 'h.v',
        'tiap jam': 'o.h',
        'tiap 2 jam': 'o.b.h',
        'tiap pagi': 'o.m',
        'tiap malam': 'o.n',
        'segera': 'cito',
        'diminum sekaligus': 'haust'
    };

    // Find timing conversion
    let timing = '';
    for (const [indonesian, latin] of Object.entries(timingConversions)) {
        if (latinSig.includes(indonesian)) {
            timing = latin;
            break;
        }
    }

    // Build final Latin Sig
    if (timing) {
        result = result ? `${result} ${timing}` : timing;
    }

    // If no conversion happened, preserve original
    if (!result) {
        result = caraPakai;
    }

    return result;
}
root.PrescriptionSig = {toRoman, convertToLatinSig};
if (typeof module !== 'undefined' && module.exports) module.exports = root.PrescriptionSig;
})(typeof window !== 'undefined' ? window : globalThis);
