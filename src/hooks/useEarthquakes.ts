import { useQuery } from '@tanstack/react-query'
import { formatISO, subDays } from 'date-fns'

export interface EarthquakeFeature {
  id: string
  geometry: { type: 'Point'; coordinates: [number, number, number] }
  properties: {
    mag: number | null
    place: string
    time: number
    url: string
  }
}

export interface EarthquakeResponse {
  type: 'FeatureCollection'
  features: EarthquakeFeature[]
}

const USGS_ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query'

export function useEarthquakes() {
  return useQuery<EarthquakeResponse>({
    queryKey: ['earthquakes', '30days'],
    queryFn: async () => {
      const end = new Date()
      const start = subDays(end, 30)
      const params = new URLSearchParams({
        format: 'geojson',
        starttime: formatISO(start, { representation: 'date' }),
        endtime: formatISO(end, { representation: 'date' }),
        orderby: 'time',
        limit: '10000',
      })
      const url = `${USGS_ENDPOINT}?${params.toString()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`USGS fetch failed ${res.status}`)
      const data = (await res.json()) as EarthquakeResponse
      return data
    },
  })
}


