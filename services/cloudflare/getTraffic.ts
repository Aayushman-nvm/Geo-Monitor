import dotenv from "dotenv";
dotenv.config();

const baseUrl="https://api.cloudflare.com/client/v4";
const cloudflareApi=process.env.CLOUDFLARE_API_KEY;

const attackEP="/radar/attacks/layer3/top/attacks?dateRange=7d";
const topOriginEP="/radar/attacks/layer3/top/locations/origin?dateRange=7d";
const topLocationsTargetEP="/radar/attacks/layer3/top/locations/target?dateRange=7d";
//const attackTimeseriesEP="/radar/attacks/layer3/timeseries?dateRange=7d&direction=ORIGIN";
const vectorSummary="/radar/attacks/layer3/summary/{dimension}";

export async function getTraffic() {
  const data1 = await fetch(`${baseUrl}${attackEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  const data2 = await fetch(`${baseUrl}${topOriginEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  const data3 = await fetch(`${baseUrl}${topLocationsTargetEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  /*const data4 = await fetch(`${baseUrl}${attackTimeseriesEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });*/

  // ✅ Convert to JSON
  const json1 = await data1.json();
  const json2 = await data2.json();
  const json3 = await data3.json();
  //const json4 = await data4.json();

  console.log(
    `Data1: ${JSON.stringify(json1, null, 2)}\n` +
    `Data2: ${JSON.stringify(json2, null, 2)}\n` +
    `Data3: ${JSON.stringify(json3, null, 2)}\n` 
  );

  // ✅ Return combined result
  return {
    topAttacks: json1,
    topOrigins: json2,
    topTargets: json3,
  };
}

getTraffic();