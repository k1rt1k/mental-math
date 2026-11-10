// An independent evaluator for Real-life questions: it re-reads the question text and never looks at how the generator built it.
// Any of the supported currency symbols may start an amount.
const FACT = { km: ['m', 1000], h: ['min', 60], kg: ['g', 1000], m: ['cm', 100], L: ['mL', 1000], ft: ['inches', 12], yd: ['ft', 3], lb: ['oz', 16], day: ['h', 24], week: ['days', 7], min: ['s', 60], cm: ['mm', 10] };
const mins = (t) => { const [h, m] = t.split(':').map(Number); return (h % 12) * 60 + m; };
const C = '[$£€₹]';
const R2 = (x) => Math.round(x * 100) / 100;

export function lifeAnswer(q0) {
  const q = q0.replace(new RegExp(C, 'g'), '$');
  let m;
  if ((m = /^(\d+)% tip on \$(\d+)$/.exec(q))) return +m[1] * +m[2] / 100;
  if ((m = /^(\d+)% off \$(\d+)$/.exec(q))) return +m[2] * (100 - +m[1]) / 100;
  if ((m = /^(\d+)% off \$(\d+)\. You save\?$/.exec(q))) return +m[1] * +m[2] / 100;
  if ((m = /^Was \$(\d+), now \$(\d+)\. % off\?$/.exec(q))) return (+m[1] - +m[2]) * 100 / +m[1];
  if ((m = /^Paid \$(\d+) after (\d+)% off\. Original price\?$/.exec(q))) return +m[1] * 100 / (100 - +m[2]);
  if ((m = /^Bill \$(\d+) plus (\d+)% tip\. Total\?$/.exec(q))) return +m[1] * (100 + +m[2]) / 100;
  if ((m = /^\$(\d+) plus (\d+)% GST$/.exec(q))) return +m[1] * (100 + +m[2]) / 100;
  if ((m = /^GST at (\d+)% on \$(\d+)$/.exec(q))) return +m[1] * +m[2] / 100;
  if ((m = /^\$(\d+) includes (\d+)% GST\. Price before GST\?$/.exec(q))) return +m[1] * 100 / (100 + +m[2]);
  if ((m = /^\$(\d+) bill, (\d+)% tip, (\d+) people\. Each pays\?$/.exec(q))) return +m[1] * (100 + +m[2]) / 100 / +m[3];
  if ((m = /^\$(\d+) plus (\d+)% GST, (\d+) people\. Each pays\?$/.exec(q))) return +m[1] * (100 + +m[2]) / 100 / +m[3];
  if ((m = /^(\d+) km\/h for ([\d.]+) h\. Distance\?$/.exec(q))) return +m[1] * +m[2];
  if ((m = /^(\d+) km at (\d+) km\/h\. Hours\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^(\d+) km at (\d+) km per litre\. Litres\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^(\d+) km, (\d+) km per litre, \$(\d+) per litre\. Cost\?$/.exec(q))) return +m[1] / +m[2] * +m[3];
  if ((m = /^(\d+) h (\d+) min \+ (\d+) h (\d+) min\. Minutes\?$/.exec(q))) return (+m[1] + +m[3]) * 60 + +m[2] + +m[4];
  if ((m = /^\$(\d+) an hour for ([\d.]+) h\. Pay\?$/.exec(q))) return +m[1] * +m[2];
  if ((m = /^Days from (\d+) (\w+) to (\d+) (\w+)$/.exec(q))) { const N = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], y = 2026, t = (d, mo) => Date.UTC(y, N.indexOf(mo), +d); return (t(m[3], m[4]) - t(m[1], m[2])) / 864e5; }
  if ((m = /^(\d+) (g|ml) for \$([\d.]+)\. Price per 100 (g|ml)\?$/.exec(q))) return +m[3] / (+m[1] / 100);
  if ((m = /^(\d+) for \$([\d.]+) or (\d+) for \$([\d.]+)\. Saving per item\?$/.exec(q))) return +m[2] / +m[1] - +m[4] / +m[3];
  if ((m = /^Buy (\d+) get (\d+) free, \$(\d+) each\. Cost of (\d+) items\?$/.exec(q))) return (+m[4] / (+m[1] + +m[2])) * +m[1] * +m[3];
  if ((m = /^\$(\d+) each, or (\d+) for \$(\d+)\. Saving on \d+\?$/.exec(q))) return +m[1] * +m[2] - +m[3];
  if ((m = /^\$(\d+) at (\d+)% a year for (\d+) years\. Simple interest\?$/.exec(q))) return (+m[1] * +m[2] * +m[3]) / 100;
  if ((m = /^(Rose|Fell) from \$(\d+) to \$(\d+)\. % (rise|fall)\?$/.exec(q))) return (Math.abs(+m[3] - +m[2]) * 100) / +m[2];
  if ((m = /^\$(\d+) salary, (\d+)% hike\. New salary\?$/.exec(q))) return (+m[1] * (100 + +m[2])) / 100;
  if ((m = /^Rule of 72: years to double at (\d+)%\?$/.exec(q))) return 72 / +m[1];
  if ((m = /^Save \$(\d+) a month\. Months to reach \$(\d+)\?$/.exec(q))) return +m[2] / +m[1];
  if ((m = /^\$(\d+) at (\d+)% a year for 2 years, compounded\. Total\?$/.exec(q))) return +m[1] * (1 + +m[2] / 100) ** 2;
  if ((m = /^([\d.]+) runs in (\d+) overs\. Run rate\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^Target (\d+) in (\d+) overs\. (\d+) after (\d+)\. Runs per over needed\?$/.exec(q))) return (+m[1] - +m[3]) / (+m[2] - +m[4]);
  if ((m = /^(\d+) runs off (\d+) balls\. Strike rate\?$/.exec(q))) return (+m[1] * 100) / +m[2];
  if ((m = /^(\d+) runs in (\d+) innings\. Average\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^(\d+)\.(\d) overs\. Balls bowled\?$/.exec(q))) return +m[1] * 6 + +m[2];
  if ((m = /^\$(\d+) a month\. Per year\?$/.exec(q))) return +m[1] * 12;
  if ((m = /^\$(\d+) a year\. Per month\?$/.exec(q))) return +m[1] / 12;
  if ((m = /^\$(\d+) for (\d+) days\. Per day\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^\$(\d+) income, 50-30-20 rule\. (Needs|Wants|Savings)\?$/.exec(q))) return +m[1] * { Needs: 50, Wants: 30, Savings: 20 }[m[2]] / 100;
  if ((m = /^Rent \$(\d+) and bills \$(\d+), (\d+) people\. Each\?$/.exec(q))) return (+m[1] + +m[2]) / +m[3];
  if ((m = /^\$(\d+) salary, (\d+)% deducted\. Take-home\?$/.exec(q))) return +m[1] * (100 - +m[2]) / 100;
  if ((m = /^(\d+)°C in °F$/.exec(q))) return +m[1] * 9 / 5 + 32;
  if ((m = /^(\d+)°F in °C$/.exec(q))) return (+m[1] - 32) * 5 / 9;
  if ((m = /^([\d.]+) (\w+) in (\w+)$/.exec(q))) { const x = +m[1], [a, b] = [m[2], m[3]]; return FACT[a] && FACT[a][0] == b ? x * FACT[a][1] : x / FACT[b][1]; }
  if ((m = /^Minutes from ([\d:]+) to ([\d:]+)$/.exec(q))) return ((mins(m[2]) - mins(m[1])) + 720) % 720;
  if ((m = /^Recipe: (\d+) g for (\d+)\. For (\d+)\?$/.exec(q))) return +m[1] * +m[3] / +m[2];
  if ((m = /^Ratio (\d+):(\d+)\. First is (\d+)\. Second\?$/.exec(q))) return +m[3] / +m[1] * +m[2];
  if ((m = /^([\d.]+) km in ([\d.]+) h\. km\/h\?$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^(\d+) for \$([\d.]+)\. Price of one\?$/.exec(q))) return +m[2] / +m[1];
  if ((m = /^Split \$(\d+) between (\d+)$/.exec(q))) return +m[1] / +m[2];
  if ((m = /^\$(\d+) plus (\d+)% tax$/.exec(q))) return +m[1] * (100 + +m[2]) / 100;
  if ((m = /^(\d+)% off, then (\d+)% off \$(\d+)$/.exec(q))) return +m[3] * (100 - +m[1]) * (100 - +m[2]) / 10000;
  throw new Error('unrecognised question: ' + q0);
}
export { R2 };
