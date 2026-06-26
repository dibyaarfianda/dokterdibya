function trim(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function parseSearchTerms(value) {
    return trim(value)
        .split(',')
        .map(term => term.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean);
}

function escapeLikeTerm(value) {
    return `%${trim(value).toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
}

function matchesAnyTerm(value, terms) {
    if (!terms || terms.length === 0) return true;
    const text = trim(value).toLowerCase().replace(/\s+/g, ' ');
    return terms.some(term => text.includes(term));
}

module.exports = {
    parseSearchTerms,
    escapeLikeTerm,
    matchesAnyTerm,
};
