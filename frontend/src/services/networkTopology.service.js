import { httpClient } from '../api/httpClient.js';

export const networkTopologyService = {
  getGraph: () => httpClient.get('/network-topology'),
};
