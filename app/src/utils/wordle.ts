import axios from "axios";
import { setupCache } from "axios-cache-interceptor";

type WordleResponse = {
  id: string;
  solution: string;
  print_date: string;
};

/**
 * @param date - The date for which to get the Wordle answer in YYYY-MM-DD format.
 * @returns The Wordle answer for today, or null if the request fails.
 */
export async function getAnswer(date: string) {
  const axiosWithCache = setupCache(axios);
  const url = `https://www.nytimes.com/svc/wordle/v2/${date}.json`;
  try {
    const response = await axiosWithCache.get<WordleResponse>(url, {
      cache: {
        ttl: 24 * 60 * 60 * 1000, // 24hr
      },
    });
    return response.data.solution;
  } catch (error) {
    let errorMessage: string;
    if (axios.isAxiosError(error)) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = "Unknown error";
    }
    console.error("Failed to fetch Wordle answer:", errorMessage);
    return null;
  }
}
