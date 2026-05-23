const NX = 61;
const NY = 125;


export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let weatherState = null;
    let trafficState = null;
    let hourlyTraffic = 0;
    let fifteenMinTraffic = 0;
    let fiveMinTraffic = 0;

    // 1. Fetch KMA Weather
    const weatherKey = process.env.WEATHER;
    if (weatherKey) {
        try {
            const now = new Date();
            const baseDate = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0');

            let baseHour = now.getHours();
            if (now.getMinutes() < 45) baseHour -= 1;
            if (baseHour < 0) baseHour = 23;
            const baseTime = String(baseHour).padStart(2, '0') + "00";

            const weatherUrl = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(weatherKey)}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${NX}&ny=${NY}`;

            const response = await fetch(weatherUrl);
            const data = await response.json();

            if (data.response && data.response.header.resultCode === "00") {
                const items = data.response.body.items.item;
                const ptyItem = items.find(item => item.category === "PTY");
                const ptyValue = ptyItem ? parseInt(ptyItem.obsrValue) : 0;

                weatherState = "clear";
                if (ptyValue === 1 || ptyValue === 2 || ptyValue === 5 || ptyValue === 6) {
                    weatherState = "rain";
                } else if (ptyValue === 3 || ptyValue === 7) {
                    weatherState = "snow";
                }
            } else {
                console.error("KMA Weather API error:", data.response?.header.resultMsg);
            }
        } catch (e) {
            console.error("Error fetching KMA Weather:", e);
        }
    }

    // 2. Fetch Traffic (tmType=1 hourly, tmType=2 15-min, tmType=3 5-min) in parallel
    try {
        const fetchType = async (tmType) => {
            const url = `https://data.ex.co.kr/openapi/trafficapi/trafficAll?key=5157948524&type=json&tmType=${tmType}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error status ${response.status}`);
            const data = await response.json();
            const list = data.trafficAll || [];

            // For 15-min/5-min, the response spans multiple intervals — only use the LATEST
            let targetList = list;
            if (tmType === 2 || tmType === 3) {
                const maxSumTm = list.reduce((max, t) => Math.max(max, parseInt(t.sumTm || 0)), 0);
                targetList = list.filter(t => parseInt(t.sumTm) === maxSumTm);
            }

            let sum = 0;
            targetList.forEach(t => { sum += parseInt(t.trafficAmout || 0); });
            return sum;
        };

        const [t1, t2, t3] = await Promise.all([fetchType(1), fetchType(2), fetchType(3)]);
        hourlyTraffic = t1;
        fifteenMinTraffic = t2;
        fiveMinTraffic = t3;

        trafficState = "normal";
        const primaryTraffic = hourlyTraffic > 0 ? hourlyTraffic : (fifteenMinTraffic * 4);

        if (primaryTraffic > 450000 || fifteenMinTraffic > 120000 || fiveMinTraffic > 45000) {
            trafficState = "jammed";
        } else if (primaryTraffic > 250000 || fifteenMinTraffic > 70000 || fiveMinTraffic > 25000) {
            trafficState = "busy";
        }
    } catch (e) {
        console.error("Error fetching traffic:", e);
    }

    res.json({
        weather: weatherState,
        traffic: {
            state: trafficState,
            total: hourlyTraffic,
            hourly: hourlyTraffic,
            fifteenMin: fifteenMinTraffic,
            fiveMin: fiveMinTraffic
        }
    });
}
