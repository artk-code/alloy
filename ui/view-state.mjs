export const DETAIL_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'compare', label: 'Compare' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'debug', label: 'Debug' }
];

export function paginateItems(items, page = 1, pageSize = 6) {
  const safeItems = Array.isArray(items) ? items : [];
  const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 6);
  const totalItems = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = clampPage(page, totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  const endIndex = Math.min(totalItems, startIndex + safePageSize);

  return {
    items: safeItems.slice(startIndex, endIndex),
    page: currentPage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex
  };
}

export function clampPage(page, totalPages) {
  const safeTotalPages = Math.max(1, Number.parseInt(totalPages, 10) || 1);
  const numericPage = Number.parseInt(page, 10) || 1;
  return Math.min(Math.max(1, numericPage), safeTotalPages);
}

export function normalizeDetailSection(sectionId) {
  return DETAIL_SECTIONS.some((section) => section.id === sectionId)
    ? sectionId
    : DETAIL_SECTIONS[0].id;
}
