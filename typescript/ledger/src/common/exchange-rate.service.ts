import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

@Injectable()
export class ExchangeRateService {
  constructor(private readonly http: HttpService) {}

  async getRate(base: string, target: string): Promise<number> {
    if (base === target) {
      return 1;
    }
    const url = `https://api.exchangerate.host/latest?base=${base}&symbols=${target}`;
    const response = await firstValueFrom(this.http.get(url));
    const rate = response.data?.rates?.[target];
    if (!rate) {
      throw new Error(`Exchange rate not found for ${base}/${target}`);
    }
    return rate;
  }
}
