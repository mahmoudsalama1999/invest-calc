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
  // Discounted cash flow (unlevered, end-of-year flows).
  // flows: year k income = rent*12*step^(k-1)*(1-vac)+other-opex; last partial year pro-rated.
  // resale at year N = (explicit resale price, else price*(1+g)^N) * (1 - sellingCost%).
  function dcf(o) {
    const N = o.years, step = 1 + (o.inc || 0) / 100, flows = [];
    const whole = Math.ceil(N);
    for (let k = 1; k <= whole; k++) {
      const w = Math.min(1, N - k + 1), t = Math.min(k, N);
      const cf = (o.rentAnnual * Math.pow(step, k - 1) * (1 - o.vac) + o.other - o.opex) * w;
      flows.push([t, cf]);
    }
    let resale = 0;
    if (o.resalePrice != null) resale = o.resalePrice;
    else if (o.appreciation != null) resale = o.price * Math.pow(1 + o.appreciation / 100, N);
    const net = resale * (1 - (o.sellCost || 0) / 100);
    const pvAt = r => flows.reduce((s, [t, cf]) => s + cf / Math.pow(1 + r, t), 0) + net / Math.pow(1 + r, N);
    const r = o.rate / 100;
    const pvIncome = flows.reduce((s, [t, cf]) => s + cf / Math.pow(1 + r, t), 0);
    const pvResale = net / Math.pow(1 + r, N);
    let irr = null, lo = -0.99, hi = 10;
    const f = x => pvAt(x) - o.outlay;
    if (f(lo) * f(hi) < 0) {
      for (let n = 0; n < 200; n++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
      irr = (lo + hi) / 2 * 100;
    }
    return { npv: pvIncome + pvResale - o.outlay, pvIncome, pvResale, resaleNet: net, resaleGross: resale, irr };
  }
  // Discounted payback: years until cumulative PV of income recovers `outlay`.
  // annualFn(k) = income of year k (k>=1). mode 'monthly': 12 equal monthly receipts per year, each discounted
  // at (1+R)^(m/12); mode 'annual': one receipt at each year end, discounted (1+R)^k, interpolated inside the year.
  function discPayback(outlay, annualFn, ratePct, mode) {
    if (!(outlay > 0)) return null;
    const R = ratePct / 100; let acc = 0;
    if (mode === 'annual') {
      for (let k = 1; k <= 100; k++) {
        const pv = annualFn(k) / Math.pow(1 + R, k);
        if (acc + pv >= outlay) return k - 1 + (outlay - acc) / pv;
        acc += pv;
      }
      return null;
    }
    for (let m = 1; m <= 1200; m++) {
      const pv = annualFn(Math.ceil(m / 12)) / 12 / Math.pow(1 + R, m / 12);
      if (acc + pv >= outlay) return (m - 1 + (outlay - acc) / pv) / 12;
      acc += pv;
    }
    return null;
  }
  const F = { // field keys -> Arabic labels
    PurchasePrice:'سعر الشراء', MonthlyRent:'الإيجار الشهري', OtherAnnualIncome:'دخل سنوي آخر', VacancyRate:'نسبة الشغور',
    AnnualOperatingExpenses:'المصروفات التشغيلية السنوية', AcquisitionCosts:'تكاليف الاستحواذ', InitialImprovements:'التجهيزات الأولية',
    AnnualDebtService:'خدمة الدين السنوية', InitialCashInvested:'النقد الأولي المستثمر', ResalePrice:'قيمة إعادة البيع', };
  // inputs: values in money / vacancy as fraction (0..1) / null = unknown
  function calculate(i) {
    const errors = [];
    if (!CURRENCIES.includes(i.currency)) errors.push(['Currency','اختر عملة مدعومة.']);
    if (i.annualRentIncreasePercent != null && i.annualRentIncreasePercent < 0) errors.push(['AnnualRentIncreasePercent','نسبة الزيادة السنوية لا تقبل رقما سالبا.']);
    for (const k of Object.keys(F)) {
      const v = i[k];
      if (v == null) continue;
      if (v < 0) errors.push([k, F[k] + ': القيمة لا تقبل الأرقام السالبة.']);
      else if (k === 'MonthlyRent' && i.rentAnnual != null) { if (Math.round(i.rentAnnual * 100) / 100 !== i.rentAnnual) errors.push([k, 'الإيجار السنوي: منزلتان عشريتان على الأكثر.']); }
      else if (k === 'VacancyRate') { if (v > 1) errors.push([k, 'الشغور من صفر إلى 100%.']); }
      else if (Math.round(v * 100) / 100 !== v) errors.push([k, F[k] + ': منزلتان عشريتان على الأكثر.']);
    }
    if (i.financing === 'none' && (i.AnnualDebtService > 0 || i.InitialCashInvested > 0))
      errors.push(['Financing','اختر تمويلًا عند إدخال خدمة دين أو نقد أولي، أو امسح هذه الحقول.']);
    for (const [k, n] of [['discountRate','معدل الخصم'],['holdYears','مدة الاحتفاظ'],['appreciationPct','نمو سعر العقار'],['sellingCostPct','مصاريف البيع']]) {
      if (i[k] != null && i[k] < 0) errors.push([k, n + ': القيمة لا تقبل الأرقام السالبة.']);
    }
    if (i.sellingCostPct != null && i.sellingCostPct > 100) errors.push(['sellingCostPct','مصاريف البيع من صفر إلى 100%.']);
    if (i.holdYears != null && i.holdYears > 100) errors.push(['holdYears','مدة الاحتفاظ كبيرة جدا.']);
    if (errors.length) return { errors, metrics: null };
    const p = i.PurchasePrice, r = i.MonthlyRent, o = i.OtherAnnualIncome, v = i.VacancyRate, e = i.AnnualOperatingExpenses,
      a = i.AcquisitionCosts, c = i.InitialImprovements, d = i.AnnualDebtService, q = i.InitialCashInvested;
    const inc = i.annualRentIncreasePercent || 0;
    const gross = i.rentAnnual != null && nn(r) ? i.rentAnnual : nn(r) ? r * 12 : null;
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
    // NPV / IRR
    const ddeps = ['PurchasePrice','AcquisitionCosts','InitialImprovements','MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses'];
    const ndeps = ddeps.concat(['discountRate','holdYears']);
    const ready = nn(p, a, c, r, v, o, e) && nn(i.discountRate, i.holdYears) && i.holdYears > 0;
    let D = null;
    if (ready) D = dcf({ years: i.holdYears, rate: i.discountRate, inc, rentAnnual: gross, vac: v, other: o, opex: e, price: p, outlay: p + a + c,
      resalePrice: i.ResalePrice, appreciation: i.appreciationPct, sellCost: i.sellingCostPct });
    const dm = (k, val, why) => { const missing = ndeps.filter(n => i[n] == null).map(n => F[n] || ({discountRate:'معدل الخصم',holdYears:'مدة الاحتفاظ'})[n]);
      M[k] = { value: val, ok: val != null, why: val != null ? '' : missing.length ? 'ينقص: ' + missing.join('، ') : (why || 'مدة الاحتفاظ يجب أن تكون أكبر من صفر') }; };
    dm('ResaleValue', D && D.resaleGross); dm('NPV', D && D.npv); dm('PVIncome', D && D.pvIncome); dm('PVResale', D && D.pvResale); dm('IRR', D && D.irr, 'لا يوجد معدل عائد داخلي (التدفقات لا تغطي الاستثمار)');
    const dmode = i.discountMode === 'annual' ? 'annual' : 'monthly';
    const inc2 = 1 + inc / 100;
    const dp = (k, val, deps, why) => { const miss = deps.filter(n => i[n] == null).map(n => F[n] || 'معدل الخصم');
      M[k] = { value: val, ok: val != null, why: val != null ? '' : miss.length ? 'ينقص: ' + miss.join('، ') : why }; };
    const okG = nn(p, a, c, r, i.discountRate), okN = okG && nn(v, o, e);
    const whyNone = 'رأس المال لا يُسترد خلال 100 سنة بهذا المعدل';
    dp('DiscPaybackGross', okG ? discPayback(total, k => gross * Math.pow(inc2, k - 1), i.discountRate, dmode) : null, ['PurchasePrice','AcquisitionCosts','InitialImprovements','MonthlyRent','discountRate'], whyNone);
    dp('DiscPaybackNet', okN ? discPayback(total, k => gross * Math.pow(inc2, k - 1) * (1 - v) + o - e, i.discountRate, dmode) : null, ['PurchasePrice','AcquisitionCosts','InitialImprovements','MonthlyRent','VacancyRate','OtherAnnualIncome','AnnualOperatingExpenses','discountRate'], whyNone);
    return { errors: [], metrics: M };
  }
  const api = { discPayback, dcf, calculate, purchasePrice, payback, rentUnits, CURRENCIES };
  if (typeof module !== 'undefined') module.exports = api; else root.InvCalc = api;
})(typeof self !== 'undefined' ? self : this);
