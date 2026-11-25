// Port of RealEstateDesk InvestmentCalculator (investment/2) + RentProjection.
(function (root) {
  const CURRENCIES = ['EGP','USD','EUR','GBP','SAR','AED','KWD','QAR','BHD','OMR','JOD'];
  const nn = (...v) => v.every(x => x !== null && x !== undefined && !Number.isNaN(x));
  // total rent in units of year-one annual rent: sum_{k<n} step^k + partial*step^n
  function rentUnits(years, step) {
    const whole = Math.floor(years), part = years - whole;
    let sum = 0, f = 1;
    for (let k = 0; k < whole; k++) { sum += f; f *= step; }
    return sum + part * f;
  }
  function payback(investment, rent, other, inc) {
    if (!nn(investment, rent, other) || !(investment > 0)) return null;
    const step = 1 + inc / 100;
    if (step === 1 || rent === 0) return rent + other > 0 ? investment / (rent + other) : null;
    if (rent + other >= investment) return investment / (rent + other);
    // year by year: income is nondecreasing, so first crossing is unique
    let acc = 0, low = 0, f = 1;
    for (let y = 1; y <= 2000; y++) {
      const next = rent * f + other;           // income of year y
      if (acc + next >= investment) return low + (investment - acc) / next;
      acc += next; low = y; f *= step;
      if (!isFinite(acc)) return null;
    }
    return null;
  }
  function purchasePrice(rent, years, inc) {
    if (!(rent > 0)) throw new Error('أدخل إيجارا شهريا موجبا.');
    if (Math.round(rent * 100) / 100 !== rent) throw new Error('الإيجار بمنزلتين عشريتين على الأكثر.');
    if (!(years > 0)) throw new Error('أدخل فترة استرداد أكبر من صفر.');
    if (inc < 0) throw new Error('أدخل نسبة زيادة موجبة أو صفرا.');
    const step = 1 + inc / 100;
    const units = step === 1 ? years : rentUnits(years, step);
    const p = Math.round(rent * 12 * units * 100 + 1e-9) / 100;
    if (!isFinite(p) || p === 0) throw new Error('السعر المحسوب خارج الحدود.');
    return p;
  }
  const F = { // field keys -> Arabic labels
    PurchasePrice:'سعر الشراء', MonthlyRent:'الإيجار الشهري', OtherAnnualIncome:'دخل سنوي آخر', VacancyRate:'نسبة الشغور',
    AnnualOperatingExpenses:'المصروفات التشغيلية السنوية', AcquisitionCosts:'تكاليف الاستحواذ', InitialImprovements:'التجهيزات الأولية',
    AnnualDebtService:'خدمة الدين السنوية', InitialCashInvested:'النقد الأولي المستثمر' };
  // inputs: values in money / vacancy as fraction (0..1) / null = unknown
  function calculate(i) {
    const errors = [];
    if (!CURRENCIES.includes(i.currency)) errors.push(['Currency','اختر عملة مدعومة.']);
    if (i.annualRentIncreasePercent != null && i.annualRentIncreasePercent < 0) errors.push(['AnnualRentIncreasePercent','نسبة الزيادة السنوية لا تقبل رقما سالبا.']);
    for (const k of Object.keys(F)) {
      const v = i[k];
      if (v == null) continue;
      if (v < 0) errors.push([k, F[k] + ': القيمة لا تقبل الأرقام السالبة.']);
      else if (k === 'VacancyRate') { if (v > 1) errors.push([k, 'الشغور من صفر إلى 100%.']); }
      else if (Math.round(v * 100) / 100 !== v) errors.push([k, F[k] + ': منزلتان عشريتان على الأكثر.']);
    }
    if (i.financing === 'none' && (i.AnnualDebtService > 0 || i.InitialCashInvested > 0))
      errors.push(['Financing','اختر تمويلًا عند إدخال خدمة دين أو نقد أولي، أو امسح هذه الحقول.']);
    if (errors.length) return { errors, metrics: null };
    const p = i.PurchasePrice, r = i.MonthlyRent, o = i.OtherAnnualIncome, v = i.VacancyRate, e = i.AnnualOperatingExpenses,
      a = i.AcquisitionCosts, c = i.InitialImprovements, d = i.AnnualDebtService, q = i.InitialCashInvested;
    const inc = i.annualRentIncreasePercent || 0;
    const gross = nn(r) ? r * 12 : null;
    const effective = nn(gross, v, o) ? gross * (1 - v) + o : null;
    const noi = nn(effective, e) ? effective - e : null;
    const total = nn(p, a, c) ? p + a + c : null;
    const pct = (n, dn) => nn(n, dn) && dn > 0 ? n / dn * 100 : null;
    const cash = i.financing === 'none' ? noi : i.financing === 'financed' ? (nn(noi, d) ? noi - d : null) : null;
    const M = {};
    const add = (k, val, deps, reason) => {
      const missing = deps.filter(n => i[n] == null).map(n => F[n]);
      M[k] = { value: val, ok: val != null, why: val != null ? '' : missing.length ? 'ينقص: ' + missing.join('، ') : reason };
    };
    add('GrossAnnualIncome', gross, ['MonthlyRent'], '');
    add('GrossMonthlyYield', pct(r, p), ['MonthlyRent','PurchasePrice'], 'سعر الشراء يجب أن يكون أكبر من صفر');
    add('GrossAnnualYield', pct(gross, p), ['MonthlyRent','PurchasePrice'], 'سعر الشراء يجب أن يكون أكبر من صفر');
    add('EffectiveAnnualIncome', effective, ['MonthlyRent','VacancyRate','OtherAnnualIncome'], '');
    add('NetOperatingIncome', noi, ['MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses'], '');
    add('TotalInvestment', total, ['PurchasePrice','AcquisitionCosts','InitialImprovements'], '');
    add('OperatingYieldOnPrice', pct(noi, p), ['MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses','PurchasePrice'], 'سعر الشراء يجب أن يكون أكبر من صفر');
    add('NetYieldOnTotalInvestment', pct(noi, total), ['MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses','PurchasePrice','AcquisitionCosts','InitialImprovements'], 'إجمالي الاستثمار يجب أن يكون أكبر من صفر');
    add('GrossPaybackYears', payback(total, gross, 0, inc), ['PurchasePrice','AcquisitionCosts','InitialImprovements','MonthlyRent'], 'الاستثمار أو الدخل غير موجب');
    add('GrossPaybackYearsOnPrice', payback(p, gross, 0, inc), ['PurchasePrice','MonthlyRent'], 'السعر أو الدخل غير موجب');
    add('OperatingPaybackYears', payback(total, nn(gross, v) ? gross * (1 - v) : null, nn(o, e) ? o - e : null, inc), ['PurchasePrice','AcquisitionCosts','InitialImprovements','MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses'], 'الاستثمار أو صافي الدخل غير موجب');
    const cdeps = ['MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses'].concat(i.financing === 'financed' ? ['AnnualDebtService'] : []);
    add('AnnualCashFlow', cash, cdeps, 'حدد حالة التمويل');
    add('AverageMonthlyCashFlow', cash != null ? cash / 12 : null, cdeps, 'حدد حالة التمويل');
    add('CashOnCashReturn', i.financing === 'financed' ? pct(cash, q) : null, i.financing === 'financed' ? cdeps.concat(['InitialCashInvested']) : [], i.financing === 'financed' ? 'النقد المستثمر يجب أن يكون أكبر من صفر' : 'يتطلب تمويلًا');
    return { errors: [], metrics: M };
  }
  const api = { calculate, purchasePrice, payback, rentUnits, CURRENCIES };
  if (typeof module !== 'undefined') module.exports = api; else root.InvCalc = api;
})(typeof self !== 'undefined' ? self : this);
