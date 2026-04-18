import dotenv from "dotenv";
dotenv.config();

const baseUrl="https://api.cloudflare.com/client/v4";
const cloudflareApi=process.env.CLOUDFLARE_API_KEY;

const outagesEP="/radar/annotations/outages?dateRange=7d";
const BGP_HighjackEP="/radar/bgp/hijacks/events";
const ASN_ListEP="/radar/entities/asns";
const IP_ASNEP="/radar/entities/asns/ip?dateRange=7d&ip=196.220.224.0";
//const locationEP="/radar/entities/locations/{location}"

export async function getAnomalies() {
  const data1 = await fetch(`${baseUrl}${outagesEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  const data2 = await fetch(`${baseUrl}${BGP_HighjackEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  const data3 = await fetch(`${baseUrl}${ASN_ListEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  const data4 = await fetch(`${baseUrl}${IP_ASNEP}`, {
    headers: { Authorization: `Bearer ${cloudflareApi}` }
  });

  // ✅ Convert responses to JSON
  const json1 = await data1.json();
  const json2 = await data2.json();
  const json3 = await data3.json();
  const json4 = await data4.json();

  console.log(
    `Data1: ${JSON.stringify(json1, null, 2)}\n` +
    `Data2: ${JSON.stringify(json2, null, 2)}\n` +
    `Data3: ${JSON.stringify(json3, null, 2)}\n` +
    `Data4: ${JSON.stringify(json4, null, 2)}\n`
  );

  // ✅ Return combined JSON
  return {
    outages: json1,
    bgpHijacks: json2,
    asnList: json3,
    ipAsn: json4
  };
}

getAnomalies();