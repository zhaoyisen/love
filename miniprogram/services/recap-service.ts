import { apiRequest } from "./request";

export const recapService = {
  current: (year: number) => apiRequest<any>({ path: `/recaps/current?year=${year}` }),
  candidates: (year: number) => apiRequest<any>({ path: `/recaps/current/candidates?year=${year}` }),
  update: (year: number, title: string, selectedMomentIds: string[]) => apiRequest<any>({
    path: "/recaps/current",
    method: "PATCH",
    data: { year, title, selected_moment_ids: selectedMomentIds }
  }),
  generate: (year: number) => apiRequest<any>({
    path: "/recaps/current/generate",
    method: "POST",
    data: { year }
  })
};
