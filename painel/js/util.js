// Utilidades compartilhadas pelas páginas do Painel APS (script comum, carregado no <head>).
// esc: escapa texto para entrar em HTML, inclusive dentro de atributos com aspas simples ou duplas.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
