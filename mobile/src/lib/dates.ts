export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
