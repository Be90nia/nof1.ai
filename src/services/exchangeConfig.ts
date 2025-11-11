/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * 交易所配置辅助函数
 * Exchange configuration helper functions
 */

import { ExchangeConfig, ExchangeType } from "../types/exchange";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
  name: "exchange-config",
  level: "info",
});

/**
 * 获取当前交易所类型
 * Get current exchange type
 * @returns 交易所类型 Exchange type
 */
export function getCurrentExchangeType(): ExchangeType {
  const exchangeType = process.env.DEFAULT_EXCHANGE?.toLowerCase() || "okx";
  
  switch (exchangeType) {
    case "gateio":
    case "gate":
      return ExchangeType.GATEIO;
    case "okx":
      return ExchangeType.OKX;
    default:
      logger.warn(`未知的交易所类型: ${exchangeType}，默认使用 OKX`);
      return ExchangeType.OKX;
  }
}

/**
 * 获取交易所配置
 * Get exchange configuration
 * @param exchangeType 交易所类型 Exchange type
 * @returns 交易所配置 Exchange configuration
 */
export function getExchangeConfig(exchangeType?: ExchangeType): ExchangeConfig {
  const type = exchangeType || getCurrentExchangeType();
  
  if (type === ExchangeType.GATEIO) {
    return {
      apiKey: process.env.GATE_API_KEY || "",
      apiSecret: process.env.GATE_API_SECRET || "",
      sandbox: process.env.GATE_SANDBOX === "true",
    };
  } else if (type === ExchangeType.OKX) {
    return {
      apiKey: process.env.OKX_API_KEY || "",
      apiSecret: process.env.OKX_API_SECRET || "",
      passphrase: process.env.OKX_API_PASSPHRASE || "",
      sandbox: process.env.OKX_SANDBOX === "true",
    };
  } else {
    throw new Error(`不支持的交易所类型: ${type}`);
  }
}