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
 * 多交易所API类型扩展定义
 * 支持Gate.io和OKX等交易所的统一接口
 */

// 交易所类型枚举
export enum ExchangeType {
  GATEIO = 'gateio',
  OKX = 'okx',
}

// 基础账户信息接口（以Gate.io为基准）
export interface BaseAccount {
  currency?: string;
  total?: string;
  available?: string;
  position_margin?: string;
  positionMargin?: string;
  order_margin?: string;
  orderMargin?: string;
  unrealised_pnl?: string;
  unrealisedPnl?: string;
  [key: string]: any;
}

// 基础持仓信息接口（以Gate.io为基准）
export interface BasePosition {
  contract?: string;
  size?: string;
  leverage?: string;
  entry_price?: string;
  entryPrice?: string;
  mark_price?: string;
  markPrice?: string;
  liq_price?: string;
  liqPrice?: string;
  unrealised_pnl?: string;
  unrealisedPnl?: string;
  realised_pnl?: string;
  realisedPnl?: string;
  margin?: string;
  [key: string]: any;
}

// 基础行情信息接口（以Gate.io为基准）
export interface BaseTicker {
  contract?: string;
  last?: string;
  mark_price?: string;
  markPrice?: string;
  index_price?: string;
  indexPrice?: string;
  high_24h?: string;
  high24h?: string;
  low_24h?: string;
  low24h?: string;
  volume_24h?: string;
  volume24h?: string;
  change_percentage?: string;
  changePercentage?: string;
  [key: string]: any;
}

// 基础订单信息接口（以Gate.io为基准）
export interface BaseOrder {
  id?: string | number;
  contract?: string;
  size?: number | string;
  price?: number | string;
  tif?: string;
  isReduceOnly?: boolean;
  reduceOnly?: boolean;
  reduce_only?: boolean;
  is_reduce_only?: boolean;
  autoSize?: string;
  auto_size?: string;
  stopLoss?: number | string;
  stop_loss?: string;
  takeProfit?: number | string;
  take_profit?: string;
  status?: string;
  create_time?: string | number;
  update_time?: string | number;
  fill_price?: string;
  filled_total?: string;
  fee?: string;
  fee_currency?: string;
  left?: number | string;
  [key: string]: any;
}

// 基础K线数据接口（以Gate.io为基准）
export interface BaseCandle {
  timestamp?: number;
  volume?: string;
  close?: string;
  high?: string;
  low?: string;
  open?: string;
  [key: string]: any;
}

// 基础合约信息接口（以Gate.io为基准）
export interface BaseContract {
  id?: string;
  name?: string;
  contract?: string;
  settle?: string;
  base?: string;
  quote?: string;
  type?: string;
  leverage_min?: string;
  leverage_max?: string;
  order_size_min?: number;
  order_size_max?: number;
  order_price_min?: number;
  order_price_max?: number;
  [key: string]: any;
}

// Gate.io特定类型定义
declare module "gate-api" {
  export interface FuturesAccount extends BaseAccount {}
  export interface Position extends BasePosition {}
  export interface FuturesTicker extends BaseTicker {}
  export interface FuturesOrder extends BaseOrder {}
  export interface FuturesCandlestick extends BaseCandle {}
  export interface FuturesContract extends BaseContract {}
}

// OKX特定类型定义
// 注意：这些类型定义用于参考，实际使用时需要根据OKX API库的实际类型进行调整
export interface OkxAccount {
  adjEq?: string;          // 美金层面有效保证金
  imr?: string;            // 占用保证金
  isoEq?: string;          // 美金层面隔离保证金
  mgnRatio?: string;       // 保证金率
  mgnMode?: string;        // 保证金模式
  mmr?: string;            // 维持保证金
  notionalUsd?: string;    // 以美金价值为单位的持仓数量
  ordFroz?: string;        // 全仓挂单占用保证金
  totalEq?: string;        // 美金层面权益
  upl?: string;            // 未实现盈亏
  uplLiab?: string;        // 未实现亏损
  [key: string]: any;
}

// OKX持仓信息
export interface OkxPosition {
  ccy?: string;            // 保证金币种
  instId?: string;         // 产品ID
  instType?: string;       // 产品类型
  lever?: string;          // 杠杆倍数
  liqPx?: string;          // 预估强平价
  mgnMode?: string;        // 保证金模式
  mgnRatio?: string;       // 保证金率
  mmr?: string;            // 维持保证金
  notionalUsd?: string;    // 以美金价值为单位的持仓数量
  posCcy?: string;         // 持仓币种
  posId?: string;          // 持仓ID
  posSide?: string;        // 持仓方向
  posSize?: string;        // 以张数为单位的持仓数量
  pxUsd?: string;          // 美金面值
  ccySize?: string;        // 以币数为单位的持仓数量
  avgPx?: string;          // 开仓平均价
  upl?: string;            // 未实现盈亏
  uplRatio?: string;       // 未实现盈亏率
  interest?: string;       // 利息
  tradeId?: string;        // 最新成交ID
  optVal?: string;         // 期权权利金
  deltaBS?: string;        // delta值
  gammaBS?: string;        // gamma值
  thetaBS?: string;        // theta值
  vegaBS?: string;         // vega值
  [key: string]: any;
}

// OKX行情信息
export interface OkxTicker {
  instType?: string;       // 产品类型
  instId?: string;         // 产品ID
  last?: string;           // 最新成交价
  lastSz?: string;         // 最新成交的数量
  askPx?: string;          // 卖一价
  askSz?: string;          // 卖一价数量
  bidPx?: string;          // 买一价
  bidSz?: string;          // 买一价数量
  open24h?: string;        // 24小时开盘价
  high24h?: string;        // 24小时最高价
  low24h?: string;         // 24小时最低价
  vol24h?: string;         // 24小时成交量，以张为单位
  volCcy24h?: string;      // 24小时成交量，以币为单位
  sodUtc0?: string;        // UTC+0时区开盘价
  sodUtc8?: string;        // UTC+8时区开盘价
  ts?: string;             // 数据产生时间，Unix时间戳的毫秒数格式
  [key: string]: any;
}

// OKX订单信息
export interface OkxOrder {
  accFillSz?: string;      // 累计成交数量
  avgPx?: string;          // 成交均价
  cTime?: string;          // 订单创建时间
  category?: string;       // 订单种类
  ccy?: string;            // 保证金币种
  clOrdId?: string;        // 客户自定义订单ID
  fee?: string;            // 订单交易手续费
  feeCcy?: string;        // 手续费币种
  fillPx?: string;         // 最新成交价格
  fillSz?: string;         // 最新成交数量
  fillTime?: string;       // 最新成交时间
  instId?: string;         // 产品ID
  instType?: string;       // 产品类型
  lever?: string;          // 杠杆倍数
  ordId?: string;          // 订单ID
  ordType?: string;        // 订单类型
  px?: string;             // 委托价格
  pxLimit?: string;        // 限价单价格
  pxTrigger?: string;      // 触发价
  pxUsd?: string;          // 美金面值
  side?: string;           // 订单方向
  slOrdPx?: string;        // 止损委托价
  slTriggerPx?: string;    // 止损触发价
  source?: string;         // 订单来源
  state?: string;          // 订单状态
  sz?: string;             // 委托数量
  tag?: string;            // 订单标签
  tdMode?: string;         // 交易模式
  tgtCcy?: string;         // 目标币种
  tpOrdPx?: string;        // 止盈委托价
  tpTriggerPx?: string;    // 止盈触发价
  tradeId?: string;        // 最新成交ID
  uTime?: string;          // 订单更新时间
  [key: string]: any;
}

// OKX K线数据
export interface OkxCandle {
  ts?: string;             // 时间戳，Unix时间戳的毫秒数格式
  o?: string;              // 开盘价格
  h?: string;              // 最高价格
  l?: string;              // 最低价格
  c?: string;              // 收盘价格
  vol?: string;            // 交易量，以张为单位
  volCcy?: string;         // 交易量，以币为单位
  volCcyQuote?: string;    // 交易量，以美金为单位
  confirm?: string;        // K线状态
  [key: string]: any;
}

// OKX合约信息
export interface OkxContract {
  alias?: string;          // 合约别名
  ctMult?: string;         // 合约乘数
  ctType?: string;         // 合约类型
  ctVal?: string;          // 每张合约的价值
  ctValCcy?: string;       // 合约价值币种
  expTime?: string;        // 交割日期
  instFamily?: string;     // 品种
  instId?: string;         // 产品ID
  instType?: string;       // 产品类型
  lever?: string;          // 杠杆倍数
  listTime?: string;       // 上线时间
  maxLmtSz?: number;       // 最大委托数量
  maxMktSz?: number;       // 最大市价单委托数量
  maxTwapSz?: number;      // 最大twap订单数量
  maxIcebergSz?: number;   // 最大冰山订单数量
  minSz?: number;          // 最小委托数量
  optType?: string;        // 期权类型
  quoteCcy?: string;       // 报价币种
  settleCcy?: string;      // 盈亏结算和保证金币种
  state?: string;          // 产品状态
  stk?: string;            // 行权价
  tFee?: string;           // 手续续费率
  tickSz?: string;         // 下单价格精度
  uly?: string;            // 标的指数
  [key: string]: any;
}

// 通用交易所客户端接口
export interface ExchangeClient {
  // 账户相关
  getFuturesAccount(retries?: number): Promise<any>;
  
  // 持仓相关
  getPositions(retries?: number): Promise<any>;
  
  // 行情相关
  getFuturesTicker(contract: string, retries?: number): Promise<any>;
  getFuturesCandles(contract: string, interval?: string, limit?: number, retries?: number): Promise<any>;
  
  // 交易相关
  placeOrder(params: {
    contract: string;
    size: number;
    price?: number;
    tif?: string;
    reduceOnly?: boolean;
    autoSize?: string;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<any>;
  
  getOrder(orderId: string): Promise<any>;
  cancelOrder(orderId: string): Promise<any>;
  getOpenOrders(contract?: string): Promise<any>;
  
  // 合约相关
  getContractInfo(contract: string): Promise<any>;
  getAllContracts(): Promise<any>;
  
  // 历史数据相关
  getMyTrades(contract?: string, limit?: number): Promise<any>;
  getPositionHistory(contract?: string, limit?: number, offset?: number): Promise<any>;
  getSettlementHistory(contract?: string, limit?: number, offset?: number): Promise<any>;
  getOrderHistory(contract?: string, limit?: number): Promise<any>;
  
  // 其他功能
  setLeverage(contract: string, leverage: number): Promise<any>;
  getFundingRate(contract: string): Promise<any>;
  getOrderBook(contract: string, limit?: number): Promise<any>;
}

// 交易所工厂接口
export interface ExchangeFactory {
  createClient(apiKey: string, apiSecret: string, passphrase?: string): ExchangeClient;
  getExchangeType(): ExchangeType;
}

// 转换器接口
export interface ExchangeConverter {
  // 输入转换：将统一格式转换为特定交易所格式
  convertInput<T>(data: T, targetExchange: ExchangeType): any;
  
  // 输出转换：将特定交易所格式转换为统一格式
  convertOutput<T>(data: T, sourceExchange: ExchangeType): any;
  
  // 账户信息转换
  convertAccount(data: any, sourceExchange: ExchangeType): BaseAccount;
  
  // 持仓信息转换
  convertPosition(data: any, sourceExchange: ExchangeType): BasePosition;
  
  // 行情信息转换
  convertTicker(data: any, sourceExchange: ExchangeType): BaseTicker;
  
  // 订单信息转换
  convertOrder(data: any, sourceExchange: ExchangeType): BaseOrder;
  
  // K线数据转换
  convertCandle(data: any, sourceExchange: ExchangeType): BaseCandle;
  
  // 合约信息转换
  convertContract(data: any, sourceExchange: ExchangeType): BaseContract;
}

// 交易所配置接口
export interface ExchangeConfig {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // OKX需要
  sandbox?: boolean;
  [key: string]: any;
}

// 交易所响应包装器
export interface ExchangeResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  exchange: ExchangeType;
  timestamp: number;
}

// 交易所错误类型
export interface ExchangeError {
  code: string | number;
  message: string;
  details?: any;
  exchange: ExchangeType;
  timestamp: number;
}