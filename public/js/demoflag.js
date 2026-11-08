// Sample mode switch. No imports on purpose: state.js and sync.js read it before anything else loads.
// Sample mode lives in this browser tab only (sessionStorage, or ?demo=1 in the address), so it never reads or writes the visitor's real saved data.
export const DEMO = (() => {
  try { if (new URLSearchParams(location.search).get('demo') === '1') { try { sessionStorage.setItem('mmDemo', '1'); } catch (e) { /* blocked: the address keeps it on */ } return true; } } catch (e) { /* ignore */ }
  try { return sessionStorage.getItem('mmDemo') === '1'; } catch (e) { return false; }
})();
const home = () => location.pathname;
export const enterDemo = () => { try { sessionStorage.setItem('mmDemo', '1'); } catch (e) { /* the address carries it */ } location.href = home() + '?demo=1'; };
export const leaveDemo = () => { try { sessionStorage.removeItem('mmDemo'); } catch (e) { /* ignore */ } location.href = home(); };
