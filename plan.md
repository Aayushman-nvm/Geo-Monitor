services/
- only for external api calls
- doesnt transform the ui or mess with api data
- it gets imported in cron/ to fetch and cache the data
- getTraffic gets cloudflare traffic
- checkIP fetches IP data
- geolocateIP convertes IP into lat/lng locations on map

lib/
- these are core functions and Core intellectual property
- never mixed with API routes
- imported in essential api routes
- mergeData acts as a pipeline processor and works something like this: 
  traffic -> mergeData -> scoreing it -> final threat object to be worked with in FE
- redis.ts to connect with redis upstash, 
  used in cron job and api routes: 
  threats, history

app/api/
- api orchestration layer
- it hold all the fetching to pipelinging to scoring loggics and settig the redis cache
- /threat/route.ts gets data from redis and populates data for frontend... frontend only hits this specific endpoint

hooks/usethreats.ts
- polling data... acting as near real time data populater, used in frontend directly

store/useThreatStore
- sets threat data, that threat data is used in FE
- share data between map, glob and charts

Rules:
- never call apis from components to save rate limits
- never adding scoring logic in api routes
- never mix ui with with data logic