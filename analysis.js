const BENCHMARK = {
    key: "simulationMunicipal",
    label: "시뮬레이터 내부 전국 생활폐기물 보정 기준",
    value: 1.2,
    targetMin: 1.1,
    targetMax: 1.3,
    householdReference: 0.9506,
    description: "원본 script.js의 KOREA_WASTE_BENCHMARK.municipalPerCapitaKg 기준값"
};

const REQUIRED_COLUMNS = [
    "도시",
    "유형",
    "거주인구(명)",
    "종사인구(명)",
    "유동인구(명)",
    "총폐기물(kg/일)"
];

const CATEGORY_COLUMNS = [
    "종량제봉투 대상 폐기물(kg/일)",
    "음식물류 폐기물(kg/일)",
    "재활용가능자원(kg/일)",
    "대형폐기물(kg/일)",
    "건설폐기물(kg/일)",
    "의료폐기물(kg/일)",
    "사업장 일반폐기물(kg/일)"
];

const DETAIL_COLUMNS = [
    "음식물쓰레기(kg/일)",
    "종이류(kg/일)",
    "비닐류(kg/일)",
    "플라스틱류(kg/일)",
    "유리병(kg/일)",
    "캔/고철류(kg/일)",
    "스티로폼(kg/일)",
    "의류/섬유류(kg/일)",
    "위생용품(kg/일)",
    "일반 가연성(kg/일)",
    "불연성 생활폐기물(kg/일)",
    "가구류(kg/일)",
    "가전류(kg/일)",
    "건설폐기물(kg/일).1",
    "의료폐기물(kg/일).1",
    "사업장 일반폐기물(kg/일).1"
];

const CITY_COLORS = ["#2563eb", "#8b5cf6", "#0f766e", "#db2777"];
const DETAIL_COLORS = [
    "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#0ea5e9",
    "#6366f1", "#8b5cf6", "#ec4899", "#64748b", "#94a3b8", "#a16207",
    "#475569", "#f59e0b", "#ef4444", "#7c3aed"
];

class MinHeap {
    constructor(compare) {
        this.items = [];
        this.compare = compare;
    }

    size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];
    }

    push(item) {
        this.items.push(item);
        this.heapifyUp(this.items.length - 1);
    }

    pop() {
        if (this.items.length === 0) {
            return undefined;
        }
        const root = this.items[0];
        const last = this.items.pop();
        if (this.items.length > 0) {
            this.items[0] = last;
            this.heapifyDown(0);
        }
        return root;
    }

    heapifyUp(index) {
        let current = index;
        while (current > 0) {
            const parent = Math.floor((current - 1) / 2);
            if (this.compare(this.items[current], this.items[parent]) >= 0) {
                break;
            }
            this.swap(current, parent);
            current = parent;
        }
    }

    heapifyDown(index) {
        let current = index;
        while (true) {
            const left = current * 2 + 1;
            const right = current * 2 + 2;
            let smallest = current;

            if (left < this.items.length && this.compare(this.items[left], this.items[smallest]) < 0) {
                smallest = left;
            }
            if (right < this.items.length && this.compare(this.items[right], this.items[smallest]) < 0) {
                smallest = right;
            }
            if (smallest === current) {
                break;
            }
            this.swap(current, smallest);
            current = smallest;
        }
    }

    swap(a, b) {
        [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    }
}

let parsedRows = [];
let latestAnalysis = null;
const charts = {};

document.addEventListener("DOMContentLoaded", () => {
    bindControls();

    if (!window.Chart || !window.Papa) {
        showError("Chart.js 또는 PapaParse CDN 로딩에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 열어주세요.");
    }
});

function bindControls() {
    const fileInput = document.getElementById("csv-file");
    const dropZone = document.getElementById("drop-zone");

    fileInput.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) {
            parseFile(file);
        }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.remove("dragover");
        });
    });

    dropZone.addEventListener("drop", (event) => {
        const file = event.dataTransfer.files[0];
        if (!file) {
            showError("CSV 파일이 선택되지 않았습니다.");
            return;
        }
        fileInput.files = event.dataTransfer.files;
        parseFile(file);
    });
}

function parseFile(file) {
    if (!window.Papa || !window.Chart) {
        showError("Chart.js 또는 PapaParse CDN 로딩에 실패해 CSV를 분석할 수 없습니다.");
        return;
    }

    document.getElementById("drop-zone").classList.add("is-loading");
    document.getElementById("file-status").textContent = `${file.name} 파일을 읽는 중입니다.`;
    hideError();

    Papa.parse(file, {
        skipEmptyLines: true,
        complete: (result) => {
            try {
                parsedRows = rowsFromPapaData(result.data);
                latestAnalysis = analyzeRows(parsedRows, BENCHMARK);
                document.getElementById("file-status").textContent = `${file.name} 파싱 완료: ${parsedRows.length.toLocaleString()}개 행`;
                renderDashboard(latestAnalysis);
            } catch (error) {
                latestAnalysis = null;
                document.getElementById("results").hidden = true;
                showError(error.message);
            } finally {
                document.getElementById("drop-zone").classList.remove("is-loading");
            }
        },
        error: (error) => {
            document.getElementById("drop-zone").classList.remove("is-loading");
            showError(`CSV 파싱에 실패했습니다: ${error.message}`);
        }
    });
}

function rowsFromPapaData(data) {
    if (!data || data.length < 2) {
        throw new Error("CSV 파일에 분석할 데이터 행이 없습니다.");
    }

    const headers = dedupeHeaders(data[0].map((header) => String(header || "").trim().replace(/^\uFEFF/, "")));
    const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missing.length > 0) {
        throw new Error(`필수 컬럼이 없습니다: ${missing.join(", ")}`);
    }

    return data.slice(1)
        .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
        .map((row) => {
            const record = {};
            headers.forEach((header, index) => {
                record[header] = row[index] ?? "";
            });
            return record;
        });
}

function dedupeHeaders(headers) {
    const counts = {};
    return headers.map((header) => {
        counts[header] = (counts[header] || 0) + 1;
        return counts[header] === 1 ? header : `${header}.${counts[header] - 1}`;
    });
}

function analyzeRows(rows, benchmark) {
    if (rows.length === 0) {
        throw new Error("CSV 파일에 분석할 데이터 행이 없습니다.");
    }

    const cityMap = new Map();
    const typeMap = new Map();

    // Hash Map aggregation: CSV row count n에 대해 도시/유형 집계를 O(n)에 처리한다.
    rows.forEach((row) => {
        const cityName = String(row["도시"] || "").trim() || "미지정 도시";
        const typeName = String(row["유형"] || "").trim() || "미지정 유형";

        if (!cityMap.has(cityName)) {
            cityMap.set(cityName, createCityAggregate(cityName));
        }
        const city = cityMap.get(cityName);
        city.rowCount += 1;
        city.totalWaste += toNumber(row["총폐기물(kg/일)"]);
        city.residentPopulation += toNumber(row["거주인구(명)"]);
        city.workerPopulation += toNumber(row["종사인구(명)"]);
        city.visitorPopulation += toNumber(row["유동인구(명)"]);
        city.storageCapacity += toNumber(row["임시보관용량(kg)"]);
        sumColumns(city.categories, row, CATEGORY_COLUMNS);
        sumColumns(city.details, row, DETAIL_COLUMNS);

        const typeKey = `${cityName}||${typeName}`;
        if (!typeMap.has(typeKey)) {
            typeMap.set(typeKey, {
                cityName,
                typeName,
                count: 0,
                totalWaste: 0,
                residentPopulation: 0,
                workerPopulation: 0,
                visitorPopulation: 0
            });
        }
        const type = typeMap.get(typeKey);
        type.count += 1;
        type.totalWaste += toNumber(row["총폐기물(kg/일)"]);
        type.residentPopulation += toNumber(row["거주인구(명)"]);
        type.workerPopulation += toNumber(row["종사인구(명)"]);
        type.visitorPopulation += toNumber(row["유동인구(명)"]);
    });

    const cities = stableSort(Array.from(cityMap.values()), (a, b) => a.name.localeCompare(b.name, "ko"));
    if (cities.length < 2) {
        throw new Error("도시 컬럼에 도시가 2개 미만입니다. 도시 A/B CSV를 업로드해주세요.");
    }

    cities.forEach((city, index) => finalizeCity(city, benchmark, index));

    const invalidCities = cities.filter((city) => city.totalWaste <= 0 || city.residentPopulation <= 0 || city.effectivePopulation <= 0);
    if (invalidCities.length > 0) {
        throw new Error(`총폐기물 또는 인구가 0이라 계산할 수 없습니다: ${invalidCities.map((city) => city.name).join(", ")}`);
    }

    const typeRows = stableSort(Array.from(typeMap.values())
        .map((type) => {
            const city = cityMap.get(type.cityName);
            return {
                ...type,
                wasteShare: city && city.totalWaste > 0 ? type.totalWaste / city.totalWaste : 0
            };
        }), (a, b) => b.totalWaste - a.totalWaste);

    return {
        rowCount: rows.length,
        benchmark,
        cities,
        typeRows,
        topWasteTypes: topK(typeRows, 5, (row) => row.totalWaste),
        topWasteDetails: topK(sumEntriesAcrossCities(cities, "details"), 5, (item) => item.value),
        topWasteCategories: topK(sumEntriesAcrossCities(cities, "categories"), 5, (item) => item.value)
    };
}

function createCityAggregate(name) {
    return {
        name,
        rowCount: 0,
        totalWaste: 0,
        residentPopulation: 0,
        workerPopulation: 0,
        visitorPopulation: 0,
        effectivePopulation: 0,
        storageCapacity: 0,
        residentWastePerCapita: 0,
        effectiveWastePerCapita: 0,
        wasteIndex: 0,
        status: "보통",
        finalScore: 0,
        categories: {},
        details: {}
    };
}

function finalizeCity(city, benchmark, index) {
    city.color = CITY_COLORS[index % CITY_COLORS.length];
    city.effectivePopulation = city.residentPopulation + city.workerPopulation + city.visitorPopulation;
    city.residentWastePerCapita = divide(city.totalWaste, city.residentPopulation);
    city.effectiveWastePerCapita = divide(city.totalWaste, city.effectivePopulation);
    city.wasteIndex = divide(city.residentWastePerCapita, benchmark.value);
    city.householdReferenceIndex = divide(city.residentWastePerCapita, benchmark.householdReference);
    city.recyclableRatio = divide(city.categories["재활용가능자원(kg/일)"] || 0, city.totalWaste);
    city.foodWasteRatio = divide(city.categories["음식물류 폐기물(kg/일)"] || 0, city.totalWaste);
    city.specialWasteRatio = divide(
        (city.categories["건설폐기물(kg/일)"] || 0) +
        (city.categories["의료폐기물(kg/일)"] || 0) +
        (city.categories["사업장 일반폐기물(kg/일)"] || 0),
        city.totalWaste
    );
    city.storageDays = divide(city.storageCapacity, city.totalWaste);
    city.status = getWasteStatus(city.residentWastePerCapita);

    const distanceFromTarget = city.residentWastePerCapita < benchmark.targetMin
        ? Math.max(0, benchmark.targetMin - city.residentWastePerCapita)
        : Math.max(0, city.residentWastePerCapita - benchmark.targetMax);
    const scoreParts = {
        waste: clamp(100 - (distanceFromTarget / benchmark.value) * 100, 0, 100),
        recycling: clamp(city.recyclableRatio * 220, 0, 100),
        storage: clamp(city.storageDays / 1.5 * 100, 0, 100)
    };
    city.finalScore = weightedScore(scoreParts, { waste: 0.6, recycling: 0.25, storage: 0.15 });
    city.scoreStatus = getScoreStatus(city.finalScore);
}

function sumColumns(target, row, columns) {
    columns.forEach((column) => {
        target[column] = (target[column] || 0) + toNumber(row[column]);
    });
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }
    const number = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(number) ? number : 0;
}

function divide(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : 0;
}

function renderDashboard(analysis) {
    const results = document.getElementById("results");
    results.hidden = false;
    results.classList.remove("is-updating");
    void results.offsetWidth;
    results.classList.add("is-updating");
    document.getElementById("row-count").innerHTML = `<span data-counter data-number="${analysis.rowCount}" data-digits="0" data-suffix="개">0개</span>`;
    document.getElementById("city-count").textContent = `${analysis.cities.length.toLocaleString()}개`;
    document.getElementById("selected-benchmark").textContent = `${formatNumber(analysis.benchmark.value, 1)} kg/거주인/일`;
    renderKpis(analysis);
    renderInterpretation(analysis);
    renderDiagnostics(analysis);
    renderTypeTable(analysis);
    renderCharts(analysis);
    animateDashboard();
}

function renderKpis(analysis) {
    const grid = document.getElementById("kpi-grid");
    grid.innerHTML = analysis.cities.map((city, index) => `
        <article class="card city-card ${index === 1 ? "city-b" : ""}">
            <div class="city-card-header">
                <h2>${escapeHtml(city.name)}</h2>
                <span class="badge ${statusClass(city.status)}">${city.status}</span>
            </div>
            <div class="metric-grid">
                ${metric("총폐기물", `${formatInteger(city.totalWaste)} kg/일`, { number: city.totalWaste, digits: 0, suffix: " kg/일", line: 100 })}
                ${metric("거주인구 기준", `${formatNumber(city.residentWastePerCapita, 3)} kg/인/일`, { number: city.residentWastePerCapita, digits: 3, suffix: " kg/인/일", line: Math.min(city.wasteIndex * 100, 100) })}
                ${metric("유효인구 기준", `${formatNumber(city.effectiveWastePerCapita, 3)} kg/인/일`, { number: city.effectiveWastePerCapita, digits: 3, suffix: " kg/인/일", line: Math.min(city.effectiveWastePerCapita / BENCHMARK.value * 100, 100) })}
                ${metric("시뮬레이션 기준 대비", `${formatPercent(city.wasteIndex)}`, { number: city.wasteIndex * 100, digits: 1, suffix: "%", line: Math.min(city.wasteIndex * 100, 100) })}
                ${metric("제6차 생활 기준 참고", `${formatPercent(city.householdReferenceIndex)}`, { number: city.householdReferenceIndex * 100, digits: 1, suffix: "%", line: Math.min(city.householdReferenceIndex * 100, 100) })}
                ${metric("재활용가능자원 비율", formatPercent(city.recyclableRatio), { number: city.recyclableRatio * 100, digits: 1, suffix: "%", line: Math.min(city.recyclableRatio * 220, 100) })}
                ${metric("음식물류 폐기물 비율", formatPercent(city.foodWasteRatio), { number: city.foodWasteRatio * 100, digits: 1, suffix: "%", line: Math.min(city.foodWasteRatio * 220, 100) })}
                ${metric("산업·특수 폐기물 비율", formatPercent(city.specialWasteRatio), { number: city.specialWasteRatio * 100, digits: 1, suffix: "%", line: Math.min(city.specialWasteRatio * 400, 100) })}
                ${metric("임시보관 가능일", `${formatNumber(city.storageDays, 2)}일`, { number: city.storageDays, digits: 2, suffix: "일", line: Math.min(city.storageDays / 1.5 * 100, 100) })}
                ${metric("시뮬레이션 효율 점수", `${formatNumber(city.finalScore, 1)}점 · ${city.scoreStatus}`, { number: city.finalScore, digits: 1, suffix: `점 · ${city.scoreStatus}`, line: city.finalScore })}
            </div>
        </article>
    `).join("");
}

function metric(label, value, animation = null) {
    const line = animation ? clamp(animation.line ?? 0, 0, 100) : 0;
    const counterAttrs = animation
        ? `data-counter data-number="${animation.number}" data-digits="${animation.digits}" data-suffix="${escapeHtml(animation.suffix || "")}"`
        : "";
    return `<div class="metric" style="--metric-line: 0%" data-line="${line}"><span>${label}</span><strong ${counterAttrs}>${value}</strong></div>`;
}

function renderInterpretation(analysis) {
    const [first, second] = analysis.cities;
    const higherWaste = first.totalWaste >= second.totalWaste ? first : second;
    const lowerWaste = higherWaste === first ? second : first;
    const higherResident = first.residentWastePerCapita >= second.residentWastePerCapita ? first : second;
    const visitorSensitive = analysis.cities
        .slice()
        .sort((a, b) => (b.residentWastePerCapita - b.effectiveWastePerCapita) - (a.residentWastePerCapita - a.effectiveWastePerCapita))[0];

    const lines = [
        `이 분석은 전국 생활폐기물 기준과 시설 유형별 발생계수를 반영한 통계 기반 시뮬레이션 결과를 도시 단위로 집계한 것입니다.`,
        `${higherWaste.name}는 총폐기물 발생량이 ${lowerWaste.name}보다 높으며, 거주인구 기준 1인당 폐기물은 ${higherResident.name}가 더 높습니다.`,
        `통계 보정 기준 ${formatNumber(analysis.benchmark.value, 1)}kg/거주인/일 및 목표 범위 ${formatNumber(analysis.benchmark.targetMin, 1)}~${formatNumber(analysis.benchmark.targetMax, 1)}kg/거주인/일로 보면 ${first.name}는 ${first.status}으로 판정됩니다.`,
        `${second.name}는 통계 보정 기준 대비 ${formatPercent(second.wasteIndex)} 수준으로 ${borderlineText(second)}.`,
        `다만 ${visitorSensitive.name}는 종사인구와 유동인구 보정 효과가 커서, 유효인구 기준으로 보면 1인당 폐기물 부담이 낮아지는 특징이 있습니다.`,
        `제6차 전국폐기물통계조사 0.9506kg/인/일은 생활폐기물 참고선으로 함께 제시되어, 시뮬레이션 총폐기물 기준과 생활폐기물 기준의 차이를 동시에 확인할 수 있습니다.`,
        `세부 진단은 해시맵 집계와 Top-K 우선순위 큐로 시설 유형별 총폐기물 기여도, 생활폐기물 구성비, 산업·공장·의료·건설 관련 특수 폐기물 비중을 빠르게 추려낸 결과입니다.`,
        topKSummary(analysis)
    ];

    document.getElementById("interpretation").innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function renderDiagnostics(analysis) {
    const grid = document.getElementById("diagnostic-grid");
    grid.innerHTML = analysis.cities.map((city) => {
        const cityTypes = analysis.typeRows.filter((row) => row.cityName === city.name);
        const topType = topK(cityTypes, 1, (row) => row.totalWaste)[0];
        const topCategory = topK(objectEntries(city.categories), 1, (item) => item.value)[0];
        const topDetail = topK(objectEntries(city.details), 1, (item) => item.value)[0];
        const reasons = buildInefficiencyReasons(city, topType, topCategory, topDetail);

        return `
            <article class="diagnostic-item">
                <div class="city-card-header">
                    <h3>${escapeHtml(city.name)} 세부 진단</h3>
                    <span class="badge ${statusClass(city.status)}">${city.status}</span>
                </div>
                <ul>
                    ${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
                </ul>
            </article>
        `;
    }).join("");
}

function buildInefficiencyReasons(city, topType, topCategory, topDetail) {
    const reasons = [];
    if (city.status === "비효율적") {
        reasons.push(`거주인구 기준 1인당 폐기물이 ${formatNumber(city.residentWastePerCapita, 3)}kg/인/일로 시뮬레이터 목표 상한 ${formatNumber(BENCHMARK.targetMax, 1)}kg/인/일을 초과합니다.`);
    } else if (city.status === "보통") {
        reasons.push(`거주인구 기준 1인당 폐기물이 시뮬레이터 목표 범위 ${formatNumber(BENCHMARK.targetMin, 1)}~${formatNumber(BENCHMARK.targetMax, 1)}kg/인/일 안에 있어 보통으로 분류됩니다.`);
    } else {
        reasons.push(`거주인구 기준 1인당 폐기물이 ${formatNumber(BENCHMARK.targetMin, 1)}kg/인/일보다 낮아 시뮬레이션 기준에서 효율적으로 분류됩니다.`);
    }

    if (topType) {
        reasons.push(`${topType.typeName} 유형이 ${formatInteger(topType.totalWaste)}kg/일로 도시 총폐기물의 ${formatPercent(topType.wasteShare)}를 차지해 가장 큰 발생원입니다.`);
    }
    if (topCategory) {
        reasons.push(`대분류에서는 ${cleanColumnLabel(topCategory.label)} 비중이 ${formatPercent(divide(topCategory.value, city.totalWaste))}로 가장 큽니다.`);
    }
    if (topDetail) {
        reasons.push(`세부 품목에서는 ${cleanColumnLabel(topDetail.label)}가 ${formatInteger(topDetail.value)}kg/일로 가장 크게 나타납니다.`);
    }
    if (city.specialWasteRatio >= 0.15) {
        reasons.push(`건설·의료·사업장 일반폐기물 등 산업·특수 폐기물 비중이 ${formatPercent(city.specialWasteRatio)}로 높아 해당 시설군 관리가 주요 개선 지점입니다.`);
    } else {
        reasons.push(`산업·특수 폐기물 비중은 ${formatPercent(city.specialWasteRatio)}로, 생활폐기물 구성과 주요 시설 유형 관리가 우선 진단 대상입니다.`);
    }
    if (city.effectiveWastePerCapita < city.residentWastePerCapita * 0.75) {
        reasons.push(`유동·종사인구를 포함하면 1인당 값이 ${formatNumber(city.effectiveWastePerCapita, 3)}kg/인/일로 낮아져 활동인구 영향이 큽니다.`);
    }
    return reasons;
}

function topEntry(values) {
    return topK(objectEntries(values), 1, (item) => item.value)[0];
}

function topK(items, k, scoreFn) {
    const heap = new MinHeap((a, b) => a.score - b.score);
    items.forEach((item) => {
        const score = scoreFn(item);
        if (!Number.isFinite(score) || score <= 0) {
            return;
        }
        const node = { item, score };
        if (heap.size() < k) {
            heap.push(node);
        } else if (score > heap.peek().score) {
            heap.pop();
            heap.push(node);
        }
    });
    const result = [];
    while (heap.size() > 0) {
        result.push(heap.pop().item);
    }
    return result.reverse();
}

function stableSort(items, compare) {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const order = compare(a.item, b.item);
            return order === 0 ? a.index - b.index : order;
        })
        .map((entry) => entry.item);
}

function weightedScore(parts, weights) {
    return Object.keys(weights).reduce((sum, key) => sum + (parts[key] || 0) * weights[key], 0);
}

function objectEntries(values) {
    return Object.entries(values)
        .map(([label, value]) => ({ label, value }))
        .filter((item) => item.value > 0);
}

function sumEntriesAcrossCities(cities, field) {
    const totals = new Map();
    cities.forEach((city) => {
        Object.entries(city[field]).forEach(([label, value]) => {
            totals.set(label, (totals.get(label) || 0) + value);
        });
    });
    return Array.from(totals.entries()).map(([label, value]) => ({ label, value }));
}

function topKSummary(analysis) {
    const typeText = analysis.topWasteTypes
        .map((row) => `${row.cityName} ${row.typeName}`)
        .join(", ");
    const detailText = analysis.topWasteDetails
        .map((item) => cleanColumnLabel(item.label))
        .join(", ");
    return `상위 발생원은 ${typeText || "없음"} 순이며, 주요 세부 품목은 ${detailText || "없음"}으로 나타납니다.`;
}

function borderlineText(city) {
    if (city.status === "비효율적" && city.wasteIndex <= 1.15) {
        return "기준을 약간 초과해 경계권 비효율에 가깝습니다";
    }
    return `${city.status}으로 판정됩니다`;
}

function renderTypeTable(analysis) {
    const body = document.getElementById("type-table-body");
    body.innerHTML = analysis.typeRows.map((row) => `
        <tr>
            <td>${escapeHtml(row.cityName)}</td>
            <td>${escapeHtml(row.typeName)}</td>
            <td>${formatInteger(row.count)}</td>
            <td>${formatInteger(row.totalWaste)} kg/일</td>
            <td>${formatInteger(row.residentPopulation)}명</td>
            <td>${formatInteger(row.workerPopulation)}명</td>
            <td>${formatInteger(row.visitorPopulation)}명</td>
            <td>${formatPercent(row.wasteShare)}</td>
        </tr>
    `).join("");
}

function renderCharts(analysis) {
    destroyCharts();
    const labels = analysis.cities.map((city) => city.name);
    const colors = analysis.cities.map((city) => city.color);
    const wasteBenchmarkBands = {
        zones: [
            benchmarkZone("효율 구간", 0, analysis.benchmark.targetMin, "rgba(22, 163, 74, 0.09)", "#15803d"),
            benchmarkZone("보통 구간", analysis.benchmark.targetMin, analysis.benchmark.targetMax, "rgba(37, 99, 235, 0.12)", "#2563eb"),
            benchmarkZone("주의 구간", analysis.benchmark.targetMax, null, "rgba(239, 68, 68, 0.08)", "#b91c1c")
        ],
        markers: [
            benchmarkMarker("시뮬레이션 중심 1.2", analysis.benchmark.value, "#2563eb"),
            benchmarkMarker("제6차 참고 0.9506", analysis.benchmark.householdReference, "#ef4444")
        ]
    };

    charts.totalWasteChart = new Chart(document.getElementById("totalWasteChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "총폐기물(kg/일)",
                data: analysis.cities.map((city) => city.totalWaste),
                backgroundColor: colors
            }]
        },
        options: chartOptions("kg/일")
    });

    charts.perCapitaChart = new Chart(document.getElementById("perCapitaChart"), {
        plugins: [benchmarkBandsPlugin],
        data: {
            labels,
            datasets: [
                {
                    type: "bar",
                    label: "거주인구 기준 kg/인/일",
                    data: analysis.cities.map((city) => city.residentWastePerCapita),
                    backgroundColor: colors,
                    order: 10
                }
            ]
        },
        options: withBenchmarkBands(chartOptions("kg/인/일"), wasteBenchmarkBands)
    });
    renderBenchmarkLegend("perCapitaChart", wasteBenchmarkBands);

    charts.categoryChart = new Chart(document.getElementById("categoryChart"), {
        type: "bar",
        data: {
            labels,
            datasets: CATEGORY_COLUMNS.map((column, index) => ({
                label: cleanColumnLabel(column),
                data: analysis.cities.map((city) => city.categories[column] || 0),
                backgroundColor: DETAIL_COLORS[index % DETAIL_COLORS.length]
            }))
        },
        options: {
            ...chartOptions("kg/일"),
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            }
        }
    });

    const detailTotals = DETAIL_COLUMNS.map((column) => ({
        label: cleanColumnLabel(column),
        value: analysis.cities.reduce((sum, city) => sum + (city.details[column] || 0), 0)
    })).filter((item) => item.value > 0);

    charts.detailDonutChart = new Chart(document.getElementById("detailDonutChart"), {
        type: "doughnut",
        data: {
            labels: detailTotals.map((item) => item.label),
            datasets: [{
                data: detailTotals.map((item) => item.value),
                backgroundColor: DETAIL_COLORS
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom" },
                tooltip: { callbacks: { label: tooltipKg } }
            }
        }
    });

    const typeLabels = Array.from(new Set(analysis.typeRows.map((row) => row.typeName)));
    charts.typeWasteChart = new Chart(document.getElementById("typeWasteChart"), {
        type: "bar",
        data: {
            labels: typeLabels,
            datasets: analysis.cities.map((city) => ({
                label: city.name,
                data: typeLabels.map((typeName) => {
                    const match = analysis.typeRows.find((row) => row.cityName === city.name && row.typeName === typeName);
                    return match ? match.totalWaste : 0;
                }),
                backgroundColor: city.color
            }))
        },
        options: chartOptions("kg/일")
    });

    charts.populationBasisChart = new Chart(document.getElementById("populationBasisChart"), {
        plugins: [benchmarkBandsPlugin],
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "거주인구 기준",
                    data: analysis.cities.map((city) => city.residentWastePerCapita),
                    backgroundColor: "#2563eb",
                    order: 10
                },
                {
                    label: "유효인구 기준",
                    data: analysis.cities.map((city) => city.effectiveWastePerCapita),
                    backgroundColor: "#14b8a6",
                    order: 10
                }
            ]
        },
        options: withBenchmarkBands(chartOptions("kg/인/일"), wasteBenchmarkBands)
    });
    renderBenchmarkLegend("populationBasisChart", wasteBenchmarkBands);

    charts.scoreChart = new Chart(document.getElementById("scoreChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "시뮬레이션 효율 점수",
                data: analysis.cities.map((city) => city.finalScore),
                backgroundColor: colors
            }]
        },
        options: {
            ...chartOptions("점"),
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { callback: (value) => Number(value).toLocaleString() }
                }
            }
        }
    });

    charts.populationMixChart = new Chart(document.getElementById("populationMixChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "거주인구",
                    data: analysis.cities.map((city) => city.residentPopulation),
                    backgroundColor: "#2563eb"
                },
                {
                    label: "종사인구",
                    data: analysis.cities.map((city) => city.workerPopulation),
                    backgroundColor: "#14b8a6"
                },
                {
                    label: "유동인구",
                    data: analysis.cities.map((city) => city.visitorPopulation),
                    backgroundColor: "#f97316"
                }
            ]
        },
        options: {
            ...chartOptions("명"),
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { callback: (value) => Number(value).toLocaleString() }
                }
            }
        }
    });

    charts.wasteRatioChart = new Chart(document.getElementById("wasteRatioChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "재활용가능자원 비율",
                    data: analysis.cities.map((city) => city.recyclableRatio * 100),
                    backgroundColor: "#22c55e"
                },
                {
                    label: "음식물류 폐기물 비율",
                    data: analysis.cities.map((city) => city.foodWasteRatio * 100),
                    backgroundColor: "#f97316"
                },
                {
                    label: "산업·특수 폐기물 비율",
                    data: analysis.cities.map((city) => city.specialWasteRatio * 100),
                    backgroundColor: "#8b5cf6"
                }
            ]
        },
        options: chartOptions("%")
    });

    const storageBenchmarkBands = {
        zones: [
            benchmarkZone("부족 구간", 0, 1.5, "rgba(239, 68, 68, 0.08)", "#b91c1c"),
            benchmarkZone("권장 이상", 1.5, null, "rgba(22, 163, 74, 0.10)", "#15803d")
        ],
        markers: [
            benchmarkMarker("권장 기준 1.5일", 1.5, "#ef4444")
        ]
    };
    charts.storageChart = new Chart(document.getElementById("storageChart"), {
        plugins: [benchmarkBandsPlugin],
        data: {
            labels,
            datasets: [
                {
                    type: "bar",
                    label: "임시보관 가능일",
                    data: analysis.cities.map((city) => city.storageDays),
                    backgroundColor: colors
                }
            ]
        },
        options: withBenchmarkBands(chartOptions("일"), storageBenchmarkBands)
    });
    renderBenchmarkLegend("storageChart", storageBenchmarkBands);
}

function chartOptions(unit) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 950,
            easing: "easeOutQuart"
        },
        transitions: {
            active: {
                animation: {
                    duration: 260
                }
            }
        },
        plugins: {
            legend: { position: "bottom" },
            tooltip: {
                callbacks: {
                    label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y ?? context.parsed, 3)} ${unit}`
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: (value) => Number(value).toLocaleString()
                }
            }
        }
    };
}

function benchmarkZone(label, from, to, fill, color) {
    return {
        label,
        from,
        to,
        fill,
        color
    };
}

function benchmarkMarker(label, value, color) {
    return {
        label,
        value,
        color
    };
}

function withBenchmarkBands(options, bands) {
    return {
        ...options,
        layout: {
            ...options.layout,
            padding: {
                ...(options.layout?.padding || {}),
                right: 12
            }
        },
        plugins: {
            ...options.plugins,
            benchmarkBands: bands
        }
    };
}

function renderBenchmarkLegend(canvasId, bands) {
    const canvas = document.getElementById(canvasId);
    const chartCard = canvas.closest(".chart-card");
    chartCard.querySelector(".benchmark-legend")?.remove();

    const legend = document.createElement("div");
    legend.className = "benchmark-legend";
    legend.innerHTML = bands.zones.map((zone) => {
        return `<span><i style="--legend-color: ${zone.fill}"></i>${escapeHtml(zone.label)}</span>`;
    }).join("");
    chartCard.appendChild(legend);
}

const benchmarkBandsPlugin = {
    id: "benchmarkBands",
    beforeDatasetsDraw(chart, _args, pluginOptions) {
        const zones = pluginOptions.zones || [];
        const { ctx, chartArea, scales } = chart;
        const yScale = scales.y;
        if (!yScale || !zones.length) {
            return;
        }

        ctx.save();
        zones.forEach((zone) => {
            const min = yScale.min ?? 0;
            const max = yScale.max ?? 0;
            const from = Math.max(zone.from ?? min, min);
            const to = Math.min(zone.to ?? max, max);
            if (to <= min || from >= max) {
                return;
            }

            const yTop = yScale.getPixelForValue(to);
            const yBottom = yScale.getPixelForValue(from);
            ctx.fillStyle = zone.fill;
            ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);

            ctx.fillStyle = zone.color;
            ctx.globalAlpha = 0.74;
            ctx.font = "700 11px Segoe UI, sans-serif";
            ctx.textBaseline = "middle";
            ctx.fillText(zone.label, chartArea.left + 10, yTop + Math.max(13, (yBottom - yTop) / 2));
            ctx.globalAlpha = 1;
        });
        ctx.restore();
    },
    afterDatasetsDraw(chart, _args, pluginOptions) {
        const markers = pluginOptions.markers || [];
        if (!markers.length) {
            return;
        }

        const { ctx, chartArea, scales } = chart;
        const yScale = scales.y;
        if (!yScale) {
            return;
        }

        ctx.save();
        markers.forEach((marker, index) => {
            const y = yScale.getPixelForValue(marker.value);
            if (y < chartArea.top || y > chartArea.bottom) {
                return;
            }

            const label = marker.label;
            ctx.font = "700 11px Segoe UI, sans-serif";
            const width = Math.min(ctx.measureText(label).width + 16, 128);
            const height = 22;
            const yOffset = index % 2 === 0 ? -12 : 12;
            const x = chartArea.right - width - 8;
            const boxY = clamp(y + yOffset - height / 2, chartArea.top + 2, chartArea.bottom - height - 2);

            ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
            ctx.strokeStyle = marker.color;
            ctx.lineWidth = 2;
            roundRect(ctx, x, boxY, width, height, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = marker.color;
            ctx.beginPath();
            ctx.moveTo(chartArea.right - 1, y);
            ctx.lineTo(chartArea.right - 9, y - 5);
            ctx.lineTo(chartArea.right - 9, y + 5);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = "#1f2937";
            ctx.textBaseline = "middle";
            ctx.fillText(label, x + 8, boxY + height / 2);
        });
        ctx.restore();
    }
};

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function tooltipKg(context) {
    const value = context.parsed || 0;
    const total = context.dataset.data.reduce((sum, item) => sum + item, 0);
    return `${context.label}: ${formatInteger(value)} kg/일 (${formatPercent(divide(value, total))})`;
}

function destroyCharts() {
    Object.keys(charts).forEach((key) => {
        charts[key].destroy();
        delete charts[key];
    });
}

function getWasteStatus(residentWastePerCapita) {
    if (residentWastePerCapita < BENCHMARK.targetMin) {
        return "효율적";
    }
    if (residentWastePerCapita <= BENCHMARK.targetMax) {
        return "보통";
    }
    return "비효율적";
}

function getScoreStatus(score) {
    if (score >= 80) {
        return "효율적";
    }
    if (score >= 60) {
        return "보통";
    }
    return "비효율적";
}

function statusClass(status) {
    if (status === "효율적") {
        return "good";
    }
    if (status === "보통") {
        return "normal";
    }
    return "bad";
}

function cleanColumnLabel(column) {
    return column.replace("(kg/일)", "").replace(".1", "");
}

function formatInteger(value) {
    return Math.round(value).toLocaleString("ko-KR");
}

function formatNumber(value, digits = 2) {
    return Number(value || 0).toLocaleString("ko-KR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatPercent(value) {
    return `${formatNumber((value || 0) * 100, 1)}%`;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showError(message) {
    const panel = document.getElementById("error-panel");
    panel.hidden = false;
    panel.textContent = message;
}

function hideError() {
    const panel = document.getElementById("error-panel");
    panel.hidden = true;
    panel.textContent = "";
}

function animateDashboard() {
    revealDashboardItems();
    animateCounters();
    animateMetricLines();
}

function revealDashboardItems() {
    const items = document.querySelectorAll("#results .summary-strip, #results .card");
    items.forEach((item, index) => {
        item.classList.remove("is-visible");
        item.classList.add("reveal-item");
        item.style.setProperty("--reveal-delay", `${Math.min(index * 45, 360)}ms`);
    });
    requestAnimationFrame(() => {
        items.forEach((item) => item.classList.add("is-visible"));
    });
}

function animateCounters() {
    document.querySelectorAll("[data-counter]").forEach((node) => {
        const target = Number(node.dataset.number || 0);
        const digits = Number(node.dataset.digits || 0);
        const suffix = node.dataset.suffix || "";
        const start = performance.now();
        const duration = 850;

        function tick(now) {
            const progress = clamp((now - start) / duration, 0, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            const current = target * eased;
            node.textContent = `${formatNumber(current, digits)}${suffix}`;
            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                node.textContent = `${formatNumber(target, digits)}${suffix}`;
            }
        }

        requestAnimationFrame(tick);
    });
}

function animateMetricLines() {
    requestAnimationFrame(() => {
        document.querySelectorAll(".metric[data-line]").forEach((metricNode) => {
            metricNode.style.setProperty("--metric-line", `${metricNode.dataset.line}%`);
        });
    });
}
