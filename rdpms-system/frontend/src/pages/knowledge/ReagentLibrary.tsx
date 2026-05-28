import React, { useEffect, useRef, useState } from 'react';
import { reagentMaterialsAPI } from '../../api/client';

type ColumnKey =
  | 'commonName'
  | 'chineseName'
  | 'englishName'
  | 'category'
  | 'casNumber'
  | 'molecularFormula'
  | 'mw'
  | 'state'
  | 'defaultStockConc'
  | 'supplier';

type TableColumn = {
  key: ColumnKey;
  label: string;
  sortField: string;
  thClassName?: string;
  tdClassName?: string;
  renderCell: (row: any) => React.ReactNode;
};

type DefaultMaterial = {
  commonName: string;
  chineseName: string;
  englishName: string;
  category?: string;
  mw: number;
  state?: string;
  density?: number;
  casNumber?: string;
  molecularFormula?: string;
  purity?: number;
  defaultStockConc?: number;
  defaultStockUnit?: string;
  supplier?: string;
  notes?: string;
};

const DEFAULT_MATERIALS: DefaultMaterial[] = [
  { commonName:'Tris', chineseName:'三羟甲基氨基甲烷', englishName:'Tris base', category:'缓冲体系', mw:121.14 },
  { commonName:'NaCl', chineseName:'氯化钠', englishName:'Sodium Chloride', category:'盐类', mw:58.44 },
  { commonName:'KCl', chineseName:'氯化钾', englishName:'Potassium Chloride', category:'盐类', mw:74.55 },
  { commonName:'EDTA', chineseName:'乙二胺四乙酸二钠', englishName:'Ethylenediaminetetraacetic acid disodium salt', category:'螯合剂', mw:372.24 },
  { commonName:'MgCl2', chineseName:'氯化镁', englishName:'Magnesium Chloride', category:'盐类', mw:203.30 },
  { commonName:'CaCl2', chineseName:'氯化钙', englishName:'Calcium Chloride', category:'盐类', mw:110.98 },
  { commonName:'HEPES', chineseName:'羟乙基哌嗪乙硫磺酸', englishName:'4-(2-hydroxyethyl)-1-piperazineethanesulfonic acid', category:'缓冲体系', mw:238.30 },
  { commonName:'SDS', chineseName:'十二烷基硫酸钠', englishName:'Sodium Dodecyl Sulfate', category:'去污剂', mw:288.38 },
  { commonName:'DTT', chineseName:'二硫苏糖醇', englishName:'Dithiothreitol', category:'稳定剂', mw:154.25 },
  { commonName:'β-ME', chineseName:'β-巯基乙醇', englishName:'Beta-Mercaptoethanol', category:'稳定剂', mw:78.13 },
  { commonName:'GITC', chineseName:'异硫氰酸胍', englishName:'Guanidinium isothiocyanate', category:'变性剂', mw:118.16 },
  { commonName:'尿素', chineseName:'尿素', englishName:'Urea', category:'变性剂', mw:60.06 },
  { commonName:'蔗糖', chineseName:'蔗糖', englishName:'Sucrose', category:'稳定剂', mw:342.30 },
  { commonName:'甘油', chineseName:'甘油', englishName:'Glycerol', category:'稳定剂', mw:92.09, state:'liquid', density:1.261 },
  { commonName:'BSA', chineseName:'牛血清白蛋白', englishName:'Bovine Serum Albumin', category:'酶/蛋白', mw:66430 },
  { commonName:'Tween-20', chineseName:'吐温-20', englishName:'Polyoxyethylene sorbitan monolaurate', category:'去污剂', mw:1228.0, state:'liquid' },
  { commonName:'Triton X-100', chineseName:'曲拉通X-100', englishName:'Polyethylene glycol tert-octylphenyl ether', category:'去污剂', mw:625.0, state:'liquid' },
  { commonName:'NaOH', chineseName:'氢氧化钠', englishName:'Sodium Hydroxide', category:'pH调节剂', mw:40.00 },
  { commonName:'HCl', chineseName:'盐酸', englishName:'Hydrochloric acid', category:'pH调节剂', mw:36.46, state:'liquid', density:1.19 },
  { commonName:'KH2PO4', chineseName:'磷酸二氢钾', englishName:'Potassium dihydrogen phosphate', category:'盐类', mw:136.09 },
  { commonName:'Na2HPO4', chineseName:'磷酸氢二钠', englishName:'Disodium hydrogen phosphate', category:'盐类', mw:141.96 },
];

const STOCK_UNIT_OPTIONS = [
  { value: 'M', label: 'M' },
  { value: 'mM', label: 'mM' },
  { value: '%', label: '% (m/v)' },
  { value: 'mg/mL', label: 'mg/mL' },
];

const CATEGORY_OPTIONS = [
  '未分类',
  '缓冲体系',
  '盐类',
  '去污剂',
  '变性剂',
  '螯合剂',
  '稳定剂',
  '酶/蛋白',
  'pH调节剂',
  '酸碱试剂',
  '培养基成分',
  '核酸沉淀剂',
  '还原剂',
  '材料',
  '电泳',
  '染料/指示剂',
  '其他',
];
const COLUMN_ORDER_STORAGE_KEY = 'reagentLibrary:columnOrder';
const DEFAULT_COLUMN_ORDER: ColumnKey[] = [
  'commonName',
  'chineseName',
  'englishName',
  'category',
  'casNumber',
  'molecularFormula',
  'mw',
  'state',
  'defaultStockConc',
  'supplier',
];

const truncateWithTitle = (value: string | null | undefined, fallback = '-') => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return (
    <span className="block truncate" title={text}>
      {text}
    </span>
  );
};

export default function ReagentLibrary({ openKey, hideTopButton }: { openKey?: number; hideTopButton?: boolean }) {
  // openKey: 当父组件需要触发打开新建抽屉时，传入一个不断递增的数值即可触发打开
  // hideTopButton: 当父级页面有全局新建按钮时，可隐藏组件内部的顶部新建按钮以避免重复
  React.useEffect(() => {
    if (openKey) {
      setShowDrawer(true);
    }
    // 支持通过 query 打开新增面板：?openNew=1
    try{
      const params = new URLSearchParams(window.location.search);
      if (params.get('openNew')) setShowDrawer(true);
    }catch(e){}
  }, [openKey]);

  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('commonName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editing, setEditing] = useState<any | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>(['未分类']);
  const [recognitionText, setRecognitionText] = useState('');
  const [recognitionHint, setRecognitionHint] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTargets, setConfirmTargets] = useState<any[]>([]);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceDetails, setForceDetails] = useState<any[]>([]);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);

  // 滚动位置保持：编辑保存后恢复原位
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const savedScrollRef = useRef<number | null>(null);

  const parseCategories = React.useCallback((value: string | null | undefined) => {
    const raw = String(value || '').trim();
    if (!raw) return ['未分类'];
    const parts = raw
      .split(/[，,;；|、/\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const unique = Array.from(new Set(parts));
    return unique.length > 0 ? unique : ['未分类'];
  }, []);

  const stringifyCategories = React.useCallback((values: string[]) => {
    const cleaned = values.map((item) => item.trim()).filter(Boolean);
    return cleaned.length > 0 ? Array.from(new Set(cleaned)).join(',') : '未分类';
  }, []);

  const toggleCategoryDraft = React.useCallback((category: string) => {
    setCategoryDraft((prev) => {
      const exists = prev.includes(category);
      if (exists) {
        const next = prev.filter((item) => item !== category);
        return next.length > 0 ? next : ['未分类'];
      }
      const withoutDefault = prev.filter((item) => item !== '未分类');
      return Array.from(new Set([...withoutDefault, category]));
    });
  }, []);

  const toggleCategoryFilter = React.useCallback((category: string) => {
    setCategoryFilter((prev) => {
      if (prev.includes(category)) {
        return prev.filter((item) => item !== category);
      }
      return [...prev, category];
    });
  }, []);

  const setFormValue = React.useCallback((name: string, value: string) => {
    const form = formRef.current;
    if (!form) return;
    const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, []);

  const detectCategoriesFromText = React.useCallback((text: string) => {
    const lowered = text.toLowerCase();
    const mapping: Array<{ category: string; keywords: string[] }> = [
      { category: '缓冲体系', keywords: ['buffer', 'tris', 'hepes', 'pbs', 'mops', '缓冲'] },
      { category: '盐类', keywords: ['nacl', 'kcl', 'cacl2', 'mgcl2', 'nh4cl', '盐'] },
      { category: '去污剂', keywords: ['sds', 'tween', 'triton', 'ctab', '去污'] },
      { category: '变性剂', keywords: ['urea', 'guanidine', 'gitc', '异硫氰酸胍', '变性'] },
      { category: '螯合剂', keywords: ['edta', 'egta', '螯合'] },
      { category: '稳定剂', keywords: ['glycerol', '甘油', '海藻糖', '蔗糖', '稳定'] },
      { category: '酶/蛋白', keywords: ['bsa', 'protein', 'polymerase', 'ligase', '酶', '蛋白'] },
      { category: '酸碱试剂', keywords: ['naoh', 'koh', 'hcl', 'h2so4', '酸', '碱'] },
      { category: 'pH调节剂', keywords: ['ph', 'neutralization', '调节'] },
      { category: '培养基成分', keywords: ['培养基', 'medium', 'peptone', 'tryptone', 'yeast extract'] },
      { category: '核酸沉淀剂', keywords: ['isopropanol', 'ethanol', '乙醇', '异丙醇', '沉淀'] },
      { category: '还原剂', keywords: ['dtt', 'β-me', 'mercaptoethanol', 'tcep', '还原'] },
      { category: '材料', keywords: ['膜', 'beads', '磁珠', '耗材', 'material'] },
      { category: '电泳', keywords: ['agarose', '琼脂糖', 'tae', 'tbe', '电泳'] },
      { category: '染料/指示剂', keywords: ['染料', '指示剂', 'dye', 'indicator', 'sybr'] },
      { category: '螯合剂', keywords: ['acetate', 'citrate', '乙酸', '柠檬酸', '络合'] },
    ];

    const scored = mapping
      .map((item) => {
        const score = item.keywords.reduce((acc, keyword) => {
          return lowered.includes(keyword.toLowerCase()) ? acc + 1 : acc;
        }, 0);
        return { category: item.category, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const detected = scored.map((item) => item.category);
    return detected.length > 0 ? Array.from(new Set(detected)).slice(0, 4) : ['未分类'];
  }, []);

  const handleRecognizeText = React.useCallback(() => {
    const text = recognitionText.trim();
    if (!text) {
      setRecognitionHint('请先粘贴试剂说明文本。');
      return;
    }

    const fieldBoundary = /(?:常用名|简称|名称|中文名|中文名称|中文别名|英文名|英文名称|英文别名|english\s*name|CAS(?:\s*No\.?)?|CAS号|分子式|化学式|formula|molecular\s*formula|分子量|MW|molecular\s*weight|纯度|purity|供应商|厂家|品牌|厂商|supplier|vendor|brand|形态|状态|CBNumber|MOLFile|化学性质|安全信息|用途|价格|图谱|储存条件|熔点|溶解度|密度|PH值)\s*[:：]/i;
    const normalizeSpace = (value: string) => value.replace(/\s+/g, ' ').trim();
    const stripNoise = (value: string) => {
      return normalizeSpace(value)
        .replace(/网站主页>>?/g, '')
        .replace(/CAS数据库列表/g, '')
        .replace(/\bChemicalbook\b/ig, '')
        .replace(/[【\[][^\]】]*[\]】]/g, (segment) => segment.includes('纯度') ? segment : '')
        .replace(/^[-—:：,，;；|\s]+/, '')
        .replace(/[-—:：,，;；|\s]+$/, '');
    };
    const firstItem = (value: string) => {
      const cleaned = stripNoise(value);
      return cleaned.split(/[;；|]/).map((item) => stripNoise(item)).find(Boolean) || '';
    };
    const isLikelyBadName = (value: string) => {
      if (!value) return true;
      if (value.length > 48) return true;
      if (/[>]{2}|主页|数据库|列表|价格|图谱|用途|安全信息/.test(value)) return true;
      return false;
    };
    const extractAfterLabel = (source: string, labels: RegExp[]) => {
      for (const label of labels) {
        const match = label.exec(source);
        if (!match) continue;
        const start = match.index + match[0].length;
        const rest = source.slice(start);
        const stop = rest.search(fieldBoundary);
        const raw = stop >= 0 ? rest.slice(0, stop) : rest;
        const cleaned = stripNoise(raw);
        if (cleaned) return cleaned;
      }
      return '';
    };

    const segmentedText = text
      .replace(/(CAS(?:\s*No\.?)?\s*[:：]?\s*\d{2,7}-\d{2}-\d)/ig, '\n$1')
      .replace(/((?:中文名|中文名称|中文别名|英文名|英文名称|英文别名|分子式|化学式|分子量|MW|纯度|供应商|厂家|品牌|厂商|形态|状态|CBNumber|MOLFile)\s*[:：])/ig, '\n$1')
      .replace(/\s+/g, ' ');

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    let commonName = extractAfterLabel(segmentedText, [
      /(?:常用名|简称)\s*[:：=]/i,
      /(?:名称|name)\s*[:：=]/i,
    ]);
    let chineseName = firstItem(extractAfterLabel(segmentedText, [
      /(?:中文名|中文名称)\s*[:：=]/i,
    ]));
    let englishName = firstItem(extractAfterLabel(segmentedText, [
      /(?:英文名|英文名称|英文|english\s*name)\s*[:：=]/i,
    ])).replace(/\s+/g, ' ');

    let cas = extractAfterLabel(segmentedText, [
      /(?:CAS(?:\s*No\.?)?|CAS号)\s*[:：=]?/i,
    ]).match(/\d{2,7}-\d{2}-\d/)?.[0] || '';
    if (!cas) cas = text.match(/\d{2,7}-\d{2}-\d/)?.[0] || '';

    const molecularFormulaRaw = extractAfterLabel(segmentedText, [
      /(?:分子式|化学式|formula|molecular\s*formula)\s*[:：=]?/i,
    ]);
    const molecularFormula = molecularFormulaRaw.match(/[A-Z][A-Za-z]?[0-9]*(?:[A-Z][A-Za-z]?[0-9]*)+/)?.[0]
      || text.match(/\b([A-Z][A-Za-z]?[0-9]*(?:[A-Z][A-Za-z]?[0-9]*){2,})\b/)?.[1]
      || '';

    const mwRaw = extractAfterLabel(segmentedText, [
      /(?:MW|分子量|相对分子质量|molecular\s*weight)\s*[:：=]?/i,
    ]);
    const mw = mwRaw.match(/\d+(?:\.\d+)?/)?.[0]
      || text.match(/(?:分子量|MW)\s*[:：=]?\s*(\d+(?:\.\d+)?)/i)?.[1]
      || text.match(/(\d+(?:\.\d+)?)\s*(?:g\/?mol|Da)\b/i)?.[1]
      || '';

    const purityRaw = extractAfterLabel(segmentedText, [
      /(?:纯度|purity)\s*[:：=]?/i,
    ]);
    const purity = purityRaw.match(/\d+(?:\.\d+)?/)?.[0]
      || text.match(/(?:纯度|purity)\s*[:：=]?\s*(?:>=|＞=|>\s*)?(\d+(?:\.\d+)?)/i)?.[1]
      || '';

    const supplier = firstItem(extractAfterLabel(segmentedText, [
      /(?:供应商|厂家|品牌|厂商|supplier|vendor|brand)\s*[:：=]/i,
    ]));

    if (!chineseName) {
      const candidate = lines.find((line) => /[\u4e00-\u9fa5]/.test(line) && !/CAS|分子式|化学式|MW|纯度|供应商|安全信息|用途|价格|图谱/i.test(line));
      if (candidate) chineseName = stripNoise(candidate.replace(/[（(].*?[）)]/g, ''));
    }

    if (!englishName) {
      const candidate = lines.find((line) => /[A-Za-z]{4,}/.test(line) && !/CAS|formula|MW|purity|supplier|safety|price|用途/i.test(line));
      if (candidate) {
        const fromBracket = candidate.match(/[（(]([^)）]*[A-Za-z][^)）]*)[）)]/);
        englishName = stripNoise(fromBracket?.[1] || candidate).replace(/\s+/g, ' ');
      }
    }

    if (!commonName || isLikelyBadName(commonName)) {
      const preferredName = chineseName || englishName;
      if (preferredName) {
        commonName = preferredName;
      } else {
        const lineCandidate = lines.find((line) => {
          const candidate = stripNoise(line.replace(/[（(].*?[）)]/g, ''));
          return candidate.length > 1 && candidate.length <= 32 && !isLikelyBadName(candidate);
        });
        commonName = lineCandidate ? stripNoise(lineCandidate) : '';
      }
    }

    const bracketPair = lines.find((line) => /[\u4e00-\u9fa5].*[（(][A-Za-z].*[）)]/.test(line) || /[A-Za-z].*[（(][\u4e00-\u9fa5].*[）)]/.test(line));
    if (bracketPair) {
      const cnInLine = bracketPair.match(/([\u4e00-\u9fa5A-Za-z0-9\-\s]+)[（(]([^)）]+)[）)]/);
      if (cnInLine) {
        const left = cnInLine[1].trim();
        const right = cnInLine[2].trim();
        if (!chineseName && /[\u4e00-\u9fa5]/.test(left)) chineseName = left;
        if (!englishName && /[A-Za-z]/.test(right)) englishName = right;
      }
    }

    const parts: string[] = [];
    if (commonName) { setFormValue('commonName', commonName); parts.push('常用名'); }
    if (chineseName) { setFormValue('chineseName', chineseName); parts.push('中文名称'); }
    if (englishName) { setFormValue('englishName', englishName); parts.push('英文名称'); }
    if (cas) { setFormValue('casNumber', cas); parts.push('CAS号'); }
    if (molecularFormula) { setFormValue('molecularFormula', molecularFormula); parts.push('分子式'); }
    if (mw) { setFormValue('mw', mw); parts.push('MW'); }
    if (purity) { setFormValue('purity', purity); parts.push('纯度'); }
    if (supplier) { setFormValue('supplier', supplier); parts.push('供应商'); }

    const explicitState = extractAfterLabel(segmentedText, [/(?:形态|状态)\s*[:：=]/i]).toLowerCase();
    const stateText = text.toLowerCase();
    const hasSolidSignal = /powder|solid|crystal|颗粒|粉末|固体/.test(explicitState) || /powder|solid|crystal|粉末|固体/.test(stateText);
    const hasLiquidSignal = /liquid|液体/.test(explicitState) || /liquid|液体/.test(stateText);
    const hasSolutionSignal = /solution|溶液/.test(explicitState) || /(^|[^a-z])solution([^a-z]|$)/.test(stateText) || /(?<!水)溶液/.test(text);

    if (hasSolidSignal) {
      setFormValue('state', 'solid');
      parts.push('物态');
    } else if (hasLiquidSignal) {
      setFormValue('state', 'liquid');
      parts.push('物态');
    } else if (hasSolutionSignal && !/soluble|易溶于|溶解度/.test(stateText)) {
      setFormValue('state', 'solution');
      parts.push('物态');
    }

    const categoryFocusText = [
      commonName,
      chineseName,
      englishName,
      firstItem(extractAfterLabel(segmentedText, [/(?:中文别名|英文别名)\s*[:：=]/i])),
      molecularFormula,
    ].filter(Boolean).join('\n');
    const categories = detectCategoriesFromText(categoryFocusText || text.slice(0, 300));
    setCategoryDraft(categories);
    parts.push('试剂分类');

    if (parts.length <= 1) {
      setRecognitionHint('识别到的信息较少，请补充包含名称/CAS/化学式/MW的文本后重试。');
      return;
    }

    const confidence = parts.length >= 6 ? '较高' : parts.length >= 4 ? '中等' : '一般';
    setRecognitionHint(`已识别并填充：${Array.from(new Set(parts)).join('、')}（置信度${confidence}）。如有不准确可手动修改。`);
  }, [recognitionText, detectCategoriesFromText, setFormValue]);
  const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    while (el) {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  };

  const closeEditor = () => {
    setShowDrawer(false);
    setEditing(null);
    setRecognitionText('');
    setRecognitionHint('');
  };

  const categoryOptions = React.useMemo(() => {
    const merged = new Set(CATEGORY_OPTIONS);
    list.forEach((item) => parseCategories(item.category || '未分类').forEach((part) => merged.add(part)));
    return Array.from(merged);
  }, [list, parseCategories]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const incoming = parsed.filter((item): item is ColumnKey => DEFAULT_COLUMN_ORDER.includes(item));
      const missing = DEFAULT_COLUMN_ORDER.filter((item) => !incoming.includes(item));
      const nextOrder = [...incoming, ...missing];

      if (nextOrder.length === DEFAULT_COLUMN_ORDER.length) {
        setColumnOrder(nextOrder);
      }
    } catch (err) {
      // ignore invalid local storage data
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch (err) {
      // ignore write failure
    }
  }, [columnOrder]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await reagentMaterialsAPI.list({
        keyword,
        category: categoryFilter.length > 0 ? categoryFilter.join(',') : 'all',
        state: stateFilter,
        sortBy,
        sortOrder,
      });
      const items = res.list || [];

      // 如果数据库为空，按需初始化默认数据
      if (items.length === 0) {
        for (const m of DEFAULT_MATERIALS) {
          try {
            await reagentMaterialsAPI.create({
              commonName: m.commonName,
              chineseName: m.chineseName || null,
              englishName: m.englishName || null,
              category: m.category || '未分类',
              casNumber: m.casNumber || null,
              molecularFormula: m.molecularFormula || null,
              mw: m.mw,
              purity: m.purity || 98,
              density: m.density || null,
              state: m.state || 'solid',
              defaultStockConc: m.defaultStockConc || null,
              defaultStockUnit: m.defaultStockUnit || null,
              supplier: m.supplier || null,
              notes: m.notes || null,
            });
          } catch (e) {
            // ignore
          }
        }
        const res2 = await reagentMaterialsAPI.list({
          keyword,
          category: categoryFilter.length > 0 ? categoryFilter.join(',') : 'all',
          state: stateFilter,
          sortBy,
          sortOrder,
        });
        const nextList = res2.list || [];
        setList(nextList);
        setSelectedIds(prev => prev.filter(id => nextList.some((item: any) => item.id === id)));
      } else {
        setList(items);
        setSelectedIds(prev => prev.filter(id => items.some((item: any) => item.id === id)));
      }
      // 恢复保存前的滚动位置
      if (savedScrollRef.current !== null) {
        const pos = savedScrollRef.current;
        savedScrollRef.current = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const parent = findScrollParent(containerRef.current);
          if (parent) parent.scrollTop = pos;
        }));
      }
    } catch (e) {
      console.error('加载试剂原料失败', e);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [categoryFilter, stateFilter, sortBy, sortOrder]);

  const openNew = () => {
    setEditing(null);
    setCategoryDraft(['未分类']);
    setRecognitionText('');
    setRecognitionHint('');
    setShowDrawer(true);
  };

  const openEdit = (material: any) => {
    setEditing(material);
    setCategoryDraft(parseCategories(material?.category || '未分类'));
    setRecognitionText('');
    setRecognitionHint('');
    setShowDrawer(true);
  };

  const save = async (e: any) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data: any = Object.fromEntries(form as any);
    data.category = stringifyCategories(categoryDraft);

    // 校验 MW 必填
    if (!data.mw) { alert('请填写 MW (g/mol)'); return; }
    if (!data.commonName) { alert('请填写 常用名 (commonName)'); return; }

    try {
      if (editing) await reagentMaterialsAPI.update(editing.id, data);
      else await reagentMaterialsAPI.create(data);
      // 保存当前滚动位置，load() 完成后恢复
      savedScrollRef.current = findScrollParent(containerRef.current)?.scrollTop ?? null;
      closeEditor();
      load();
    } catch (err) { console.error(err); alert('保存失败'); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === list.length) setSelectedIds([]);
    else setSelectedIds(list.map((r:any) => r.id));
  };

  const initiateDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    const targets = list.filter((r:any) => selectedIds.includes(r.id)).map((r:any) => ({ id: r.id, commonName: r.commonName, chineseName: r.chineseName }));
    setConfirmTargets(targets);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setShowConfirm(false);
    try {
      await reagentMaterialsAPI.bulkDelete(selectedIds);
      // success
      setSelectedIds([]);
      load();
    } catch (err: any) {
      if (err?.error === 'has_references' && err?.details) {
        setForceDetails(err.details);
        setShowForceConfirm(true);
      } else {
        alert(err?.error || err?.message || '删除失败');
      }
    }
  };

  const forceDelete = async () => {
    try {
      await reagentMaterialsAPI.bulkDelete(selectedIds, true);
      setShowForceConfirm(false);
      setSelectedIds([]);
      load();
    } catch (err:any) { alert(err?.error || err?.message || '强制删除失败'); }
  };

  const renderChemicalFormula = (formula: string) => {
    if (!formula) return '-';
    const parts = formula.split(/(\d+)/);
    return (
      <span className="font-mono tracking-wider text-gray-800">
        {parts.map((part, i) =>
          /^\d+$/.test(part)
            ? <sub key={i} className="relative bottom-[-0.1em] text-[10px]">{part}</sub>
            : part
        )}
      </span>
    );
  };

  const stateBadge = (state: string) => {
    if (state === 'liquid') return 'bg-sky-50 text-sky-700 border border-sky-100';
    if (state === 'solution') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
  };

  const stateLabel = (state: string) => {
    if (state === 'liquid') return '液体';
    if (state === 'solution') return '溶液';
    return '固体';
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(field);
    setSortOrder('asc');
  };

  const renderSortHeader = (field: string, label: string) => {
    const isActive = sortBy === field;
    return (
      <button
        type="button"
        className={`flex items-center gap-1 font-semibold ${isActive ? 'text-primary-700' : 'text-gray-900'}`}
        onClick={() => handleSort(field)}
      >
        <span>{label}</span>
        <span className={`text-xs ${isActive ? 'text-primary-600' : 'text-gray-400'}`}>{isActive ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    );
  };

  const moveColumn = (key: ColumnKey, direction: 'left' | 'right') => {
    setColumnOrder((prev) => {
      const index = prev.indexOf(key);
      if (index === -1) return prev;

      if (direction === 'left' && index === 0) return prev;
      if (direction === 'right' && index === prev.length - 1) return prev;

      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const resetColumnOrder = () => {
    setColumnOrder(DEFAULT_COLUMN_ORDER);
  };

  const columnsByKey = React.useMemo<Record<ColumnKey, TableColumn>>(() => ({
    commonName: {
      key: 'commonName',
      label: '常用名',
      sortField: 'commonName',
      thClassName: 'text-left w-[140px] min-w-[140px]',
      tdClassName: 'px-4 py-3 text-left font-semibold text-gray-900 min-w-[140px] whitespace-nowrap',
      renderCell: (row) => truncateWithTitle(row.commonName || row.name),
    },
    chineseName: {
      key: 'chineseName',
      label: '中文名称',
      sortField: 'chineseName',
      thClassName: 'text-left w-[180px] min-w-[180px]',
      tdClassName: 'px-4 py-3 text-left text-gray-700 min-w-[180px] max-w-[220px]',
      renderCell: (row) => truncateWithTitle(row.chineseName),
    },
    englishName: {
      key: 'englishName',
      label: '英文名称',
      sortField: 'englishName',
      thClassName: 'text-left w-[260px] min-w-[260px]',
      tdClassName: 'px-4 py-3 text-left text-gray-500 text-xs min-w-[260px] max-w-[340px]',
      renderCell: (row) => truncateWithTitle(row.englishName),
    },
    category: {
      key: 'category',
      label: '试剂分类',
      sortField: 'category',
      thClassName: 'text-center w-[150px] min-w-[150px]',
      tdClassName: 'px-4 py-3 text-center min-w-[150px] whitespace-nowrap',
      renderCell: (row) => {
        const cats = parseCategories(row.category || '未分类');
        const primary = cats[0] || '未分类';
        const remain = Math.max(cats.length - 1, 0);
        return (
          <div className="flex items-center justify-center gap-1.5" title={cats.join(' / ')}>
            <span className="inline-flex max-w-[104px] items-center truncate rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
              {primary}
            </span>
            {remain > 0 && (
              <span className="inline-flex items-center rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                +{remain}
              </span>
            )}
          </div>
        );
      },
    },
    casNumber: {
      key: 'casNumber',
      label: 'CAS号',
      sortField: 'casNumber',
      thClassName: 'text-center w-[130px] min-w-[130px]',
      tdClassName: 'px-4 py-3 text-center font-mono text-gray-600 text-xs min-w-[130px] whitespace-nowrap',
      renderCell: (row) => row.casNumber || '-',
    },
    molecularFormula: {
      key: 'molecularFormula',
      label: '分子式',
      sortField: 'molecularFormula',
      thClassName: 'text-left w-[170px] min-w-[170px]',
      tdClassName: 'px-4 py-3 text-left min-w-[170px] whitespace-nowrap',
      renderCell: (row) => renderChemicalFormula(row.molecularFormula),
    },
    mw: {
      key: 'mw',
      label: 'MW (g/mol)',
      sortField: 'mw',
      thClassName: 'text-right w-[120px] min-w-[120px]',
      tdClassName: 'px-4 py-3 text-right font-mono text-gray-800 text-sm min-w-[120px] whitespace-nowrap',
      renderCell: (row) => {
        const value = typeof row.mw === 'number' ? row.mw : Number(row.mw);
        return Number.isFinite(value) ? value.toFixed(2) : '-';
      },
    },
    state: {
      key: 'state',
      label: '物态',
      sortField: 'state',
      thClassName: 'text-center w-[110px] min-w-[110px]',
      tdClassName: 'px-4 py-3 text-center min-w-[110px] whitespace-nowrap',
      renderCell: (row) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${stateBadge(row.state)}`}>
          {stateLabel(row.state)}
        </span>
      ),
    },
    defaultStockConc: {
      key: 'defaultStockConc',
      label: '默认储液浓度',
      sortField: 'defaultStockConc',
      thClassName: 'text-right w-[170px] min-w-[170px]',
      tdClassName: 'px-4 py-3 text-right font-mono text-gray-700 min-w-[170px] whitespace-nowrap',
      renderCell: (row) => (row.defaultStockConc != null ? `${row.defaultStockConc}${row.defaultStockUnit ? ' ' + row.defaultStockUnit : ''}` : '-'),
    },
    supplier: {
      key: 'supplier',
      label: '供应商',
      sortField: 'supplier',
      thClassName: 'text-left w-[160px] min-w-[160px]',
      tdClassName: 'px-4 py-3 text-left text-gray-600 text-sm min-w-[160px] max-w-[200px]',
      renderCell: (row) => truncateWithTitle(row.supplier),
    },
  }), [parseCategories]);

  const orderedColumns = React.useMemo(
    () => columnOrder.map((key) => columnsByKey[key]).filter(Boolean),
    [columnOrder, columnsByKey]
  );

  return (
    <div ref={containerRef}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border p-2 rounded"
            placeholder="搜索常用名/中文名/英文名/CAS号"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
          <details className="relative">
            <summary className="list-none border p-2 rounded bg-white text-sm text-gray-700 cursor-pointer min-w-[180px]">
              {categoryFilter.length > 0 ? `已选分类 ${categoryFilter.length} 项` : '全部分类'}
            </summary>
            <div className="absolute z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">可多选分类筛选</span>
                <button
                  type="button"
                  className="text-xs text-primary-600"
                  onClick={() => setCategoryFilter([])}
                >
                  清空
                </button>
              </div>
              <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {categoryOptions.map((category) => {
                  const checked = categoryFilter.includes(category);
                  return (
                    <label key={category} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategoryFilter(category)}
                      />
                      <span>{category}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>
          <select className="border p-2 rounded bg-white" value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
            <option value="all">全部物态</option>
            <option value="solid">固体</option>
            <option value="liquid">液体</option>
            <option value="solution">溶液</option>
          </select>
          <button className="btn" onClick={load}>搜索</button>
          <button
            type="button"
            className="px-3 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            onClick={() => {
              setCategoryFilter([]);
              setStateFilter('all');
              setSortBy('commonName');
              setSortOrder('asc');
            }}
          >
            重置筛选
          </button>
        </div>
        {!hideTopButton && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              onClick={() => setShowColumnSettings(true)}
            >
              列设置
            </button>
            <button className="btn btn-primary" onClick={openNew}>+ 新增试剂原料</button>
          </div>
        )}
        {hideTopButton && (
          <div>
            <button
              type="button"
              className="px-3 py-2 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              onClick={() => setShowColumnSettings(true)}
            >
              列设置
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <input type="checkbox" checked={selectedIds.length === list.length && list.length>0} onChange={toggleSelectAll} />
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span>已选 {selectedIds.length} 条</span>
              <button className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded" onClick={initiateDeleteSelected}>🗑️ 删除所选</button>
            </div>
          )}
        </div>
        <div></div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <table className="min-w-[1580px] w-full table-auto border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr>
              <th className="w-[52px] px-3 py-3 text-center border-b border-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={selectedIds.length === list.length && list.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              {orderedColumns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap [word-break:keep-all] border-b border-slate-200 ${column.thClassName || ''}`}
                >
                  <div
                    className={`flex items-center gap-1 ${
                      column.thClassName?.includes('text-right')
                        ? 'justify-end'
                        : column.thClassName?.includes('text-center')
                          ? 'justify-center'
                          : 'justify-start'
                    }`}
                  >
                    {renderSortHeader(column.sortField, column.label)}
                  </div>
                </th>
              ))}
              <th className="w-[84px] min-w-[84px] px-4 py-3 text-center text-xs font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="px-4 py-10 text-center text-slate-400 border-b border-slate-100">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                    <span>加载中...</span>
                  </div>
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length + 2} className="px-4 py-10 text-center text-slate-400 border-b border-slate-100">
                  暂无试剂数据，请调整筛选条件或新增试剂原料。
                </td>
              </tr>
            ) : (
              list.map((r: any) => (
                <tr
                  key={r.id}
                  className="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/40 transition-colors duration-150"
                >
                  <td className="px-3 py-3 text-center border-b border-slate-100 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  {orderedColumns.map((column) => (
                    <td key={column.key} className={`${column.tdClassName || 'px-4 py-3 text-sm text-slate-600'} border-b border-slate-100 align-middle`}>
                      {column.renderCell(r)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center whitespace-nowrap border-b border-slate-100 align-middle">
                    <button
                      className="inline-flex items-center rounded-md border border-primary-100 bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-700 transition-colors hover:border-primary-200 hover:bg-primary-100"
                      onClick={() => openEdit(r)}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-start justify-between border-b border-gray-100 bg-gradient-to-r from-slate-50 via-blue-50 to-white px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{editing ? '编辑试剂原料' : '新增试剂原料'}</h3>
                <p className="mt-1 text-sm text-gray-500">在不中断当前列表浏览的情况下维护试剂基础信息、储液属性和采购备注。</p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
                aria-label="关闭编辑弹窗"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form ref={formRef} onSubmit={save} className="max-h-[82vh] overflow-y-auto">
              <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
                <div className="space-y-6">
                  <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
                    <div className="mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">文本识别自动填充</h4>
                      <p className="mt-1 text-xs text-gray-500">粘贴试剂说明文本，自动识别常用名/CAS/MW/分类等信息并填入下方表单，识别后可手动修正。</p>
                    </div>
                    <textarea
                      value={recognitionText}
                      onChange={(e) => setRecognitionText(e.target.value)}
                      rows={4}
                      placeholder="示例：常用名: DTT; 中文名: 二硫苏糖醇; CAS: 3483-12-3; MW: 154.25; 物态: 固体; 供应商: 麦克林"
                      className="input min-h-[110px] resize-y"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <button type="button" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700" onClick={handleRecognizeText}>
                        识别并填充
                      </button>
                      <span className="text-xs text-emerald-700">{recognitionHint}</span>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">基础标识</h4>
                        <p className="mt-1 text-xs text-gray-500">常用名称、双语名称和化学标识用于列表检索与配方引用。</p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">必填项优先</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">常用名（必填）</label>
                        <input name="commonName" defaultValue={editing?.commonName || editing?.name || ''} placeholder="如 Tris、BSA、Tween-20" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">中文名称</label>
                        <input name="chineseName" defaultValue={editing?.chineseName || ''} placeholder="填写中文名称" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">英文名称</label>
                        <input name="englishName" defaultValue={editing?.englishName || ''} placeholder="填写英文名称" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">试剂分类</label>
                        <input type="hidden" name="category" value={stringifyCategories(categoryDraft)} readOnly />
                        <div className="rounded-lg border border-gray-200 p-3">
                          <div className="mb-2 text-xs text-gray-500">支持多选，可为同一试剂选择多个分类。</div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            {categoryDraft.map((category) => (
                              <span key={category} className="rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-700">{category}</span>
                            ))}
                          </div>
                          <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
                            {categoryOptions.map((category) => (
                              <label key={category} className="flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={categoryDraft.includes(category)}
                                  onChange={() => toggleCategoryDraft(category)}
                                />
                                <span>{category}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">CAS号</label>
                        <input name="casNumber" defaultValue={editing?.casNumber || ''} placeholder="如 50-99-7" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">分子式</label>
                        <input name="molecularFormula" defaultValue={editing?.molecularFormula || ''} placeholder="如 C6H12O6" className="input" />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-900">理化属性</h4>
                      <p className="mt-1 text-xs text-gray-500">这些字段会影响配制计算、储液建议和下游配方使用体验。</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">MW (g/mol)（必填）</label>
                        <input name="mw" type="number" step="any" defaultValue={editing?.mw ?? ''} placeholder="例如 121.14" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">物态</label>
                        <select name="state" defaultValue={editing?.state || 'solid'} className="input bg-white">
                          <option value="solid">固体</option>
                          <option value="liquid">液体</option>
                          <option value="solution">溶液</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">密度 (g/mL)</label>
                        <input name="density" type="number" step="any" defaultValue={editing?.density ?? ''} placeholder="液体/溶液建议填写" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">纯度 (%)</label>
                        <input name="purity" type="number" step="any" defaultValue={editing?.purity ?? ''} placeholder="如 98、99.5" className="input" />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-900">储液与采购信息</h4>
                      <p className="mt-1 text-xs text-gray-500">用于指导标准储液准备、供应商信息记录和实验室内部备注。</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">默认储液浓度</label>
                        <input name="defaultStockConc" type="number" step="any" defaultValue={editing?.defaultStockConc ?? ''} placeholder="如 1、10、50" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">储液单位</label>
                        <select name="defaultStockUnit" defaultValue={editing?.defaultStockUnit ?? ''} className="input bg-white">
                          <option value="">请选择储液单位</option>
                          {STOCK_UNIT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">供应商</label>
                        <input name="supplier" defaultValue={editing?.supplier ?? ''} placeholder="记录供应商、货号或采购来源" className="input" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
                        <textarea name="notes" rows={5} defaultValue={editing?.notes ?? ''} placeholder="填写储存条件、配制注意事项、品牌偏好或替代建议" className="input min-h-[120px] resize-y" />
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
                    <h4 className="text-sm font-semibold text-gray-900">编辑摘要</h4>
                    <div className="mt-4 space-y-3 text-sm text-gray-600">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">当前条目</div>
                        <div className="mt-1 font-medium text-gray-900">{editing?.commonName || editing?.name || '新建试剂原料'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">双语名称</div>
                        <div className="mt-1 leading-6">{editing?.chineseName || '未填写'} / {editing?.englishName || '未填写'}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">试剂分类</div>
                        <div className="mt-1 leading-6">{stringifyCategories(categoryDraft)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">当前理化属性</div>
                        <div className="mt-1 leading-6">MW: {editing?.mw ?? '未填写'}，物态: {editing?.state || 'solid'}，纯度: {editing?.purity ?? '未填写'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-slate-50 p-5">
                    <h4 className="text-sm font-semibold text-gray-900">填写建议</h4>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
                      <li>优先补齐常用名、MW 和物态，这三项最影响后续配制计算。</li>
                      <li>液体或溶液建议填写密度，便于在质量和体积之间换算。</li>
                      <li>默认储液浓度建议与实验室常用 SOP 保持一致，减少重复确认。</li>
                      <li>备注里可写储存温度、避光要求、常见替代品和品牌要求。</li>
                    </ul>
                  </div>
                </aside>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4">
                <button type="button" className="btn btn-secondary" onClick={closeEditor}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showColumnSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">列顺序设置</h3>
                <p className="mt-1 text-sm text-gray-500">把高频信息左移，低频信息右移。设置会自动保存到当前浏览器。</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700"
                onClick={() => setShowColumnSettings(false)}
                aria-label="关闭列设置"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              <div className="space-y-2">
                {columnOrder.map((key, index) => {
                  const column = columnsByKey[key];
                  return (
                    <div key={key} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-gray-500">{index + 1}</span>
                        <span>{column.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() => moveColumn(key, 'left')}
                        >
                          左移
                        </button>
                        <button
                          type="button"
                          className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={index === columnOrder.length - 1}
                          onClick={() => moveColumn(key, 'right')}
                        >
                          右移
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                onClick={resetColumnOrder}
              >
                恢复默认顺序
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowColumnSettings(false)}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-1/2">
            <h3 className="text-lg mb-2">确认删除</h3>
            <div className="mb-4 text-sm">
              即将删除以下 {confirmTargets.length} 条试剂原料，删除后不可恢复：
              <ul className="list-disc pl-5 mt-2">
                {confirmTargets.slice(0,5).map(t => <li key={t.id}>{t.commonName}（{t.chineseName || ''}）</li>)}
                {confirmTargets.length > 5 && <li>...等{confirmTargets.length}条</li>}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => setShowConfirm(false)}>取消</button>
              <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={confirmDelete}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {showForceConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-4 rounded w-1/2">
            <h3 className="text-lg mb-2">检测到被引用</h3>
            <div className="mb-4 text-sm">
              以下试剂已被配方引用，删除后相关配方组分将失去关联：
              <ul className="list-disc pl-5 mt-2">
                {forceDetails.map(d => <li key={d.id}>{d.id} 被 {d.count} 个配方使用</li>)}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => setShowForceConfirm(false)}>取消</button>
              <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={forceDelete}>强制删除</button>
            </div>
          </div>
        </div>
      )}    </div>
  );
}