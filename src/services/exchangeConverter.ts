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
 * 交易所数据转换工具
 * 实现Gate.io与OKX等交易所之间的数据格式转换
 * 以Gate.io格式为基准，实现与其他交易所格式的互相转换
 */

import {
  ExchangeType,
  BaseAccount,
  BasePosition,
  BaseTicker,
  BaseOrder,
  BaseCandle,
  BaseContract,
  ExchangeConverter,
  ExchangeConfig,
  ExchangeError,
} from '../types/exchange';

/**
 * 交易所转换器实现类
 * Exchange Converter Implementation Class
 */
class ExchangeConverterImpl implements ExchangeConverter {
  /**
   * 将统一格式转换为特定交易所格式
   * Convert unified format to specific exchange format
   * @param data 统一格式数据 Unified format data
   * @param targetExchange 目标交易所 Target exchange
   * @returns 转换后的特定交易所格式数据 Converted data in specific exchange format
   */
  convertInput<T>(data: T, targetExchange: ExchangeType): any {
    switch (targetExchange) {
      case ExchangeType.GATEIO:
        return this.convertToGateIo(data);
      case ExchangeType.OKX:
        return this.convertToOkx(data);
      default:
        throw new Error(`Unsupported target exchange: ${targetExchange}`);
    }
  }

  /**
   * 将特定交易所格式转换为统一格式
   * Convert specific exchange format to unified format
   * @param data 特定交易所格式数据 Data in specific exchange format
   * @param sourceExchange 源交易所 Source exchange
   * @returns 转换后的统一格式数据 Converted data in unified format
   */
  convertOutput<T>(data: T, sourceExchange: ExchangeType): any {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  /**
   * 账户信息转换
   * Convert account information
   * @param data 账户数据 Account data
   * @param sourceExchange 源交易所 Source exchange
   * @returns 统一格式的账户信息 Unified format account information
   */
  convertAccount(data: any, sourceExchange: ExchangeType): BaseAccount {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertAccountFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertAccountFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  /**
   * 持仓信息转换
   * Convert position information
   * @param data 持仓数据 Position data
   * @param sourceExchange 源交易所 Source exchange
   * @returns 统一格式的持仓信息 Unified format position information
   */
  convertPosition(data: any, sourceExchange: ExchangeType): BasePosition {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertPositionFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertPositionFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  /**
   * 行情信息转换
   * Convert ticker information
   * @param data 行情数据 Ticker data
   * @param sourceExchange 源交易所 Source exchange
   * @returns 统一格式的行情信息 Unified format ticker information
   */
  convertTicker(data: any, sourceExchange: ExchangeType): BaseTicker {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertTickerFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertTickerFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  /**
   * 订单信息转换
   * Convert order information
   * @param data 订单数据 Order data
   * @param sourceExchange 源交易所 Source exchange
   * @returns 统一格式的订单信息 Unified format order information
   */
  convertOrder(data: any, sourceExchange: ExchangeType): BaseOrder {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertOrderFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertOrderFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  /**
   * K线数据转换
   * Convert candlestick data
   * @param data K线数据 Candlestick data
   * @param sourceExchange 源交易所 Source exchange
   * @returns 统一格式的K线数据 Unified format candlestick data
   */
  convertCandle(data: any, sourceExchange: ExchangeType): BaseCandle {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertCandleFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertCandleFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  /**
   * 合约信息转换
   * Convert contract information
   * @param data 合约数据 Contract data
   * @param sourceExchange 源交易所 Source exchange
   * @returns 统一格式的合约信息 Unified format contract information
   */
  convertContract(data: any, sourceExchange: ExchangeType): BaseContract {
    switch (sourceExchange) {
      case ExchangeType.GATEIO:
        return this.convertContractFromGateIo(data);
      case ExchangeType.OKX:
        return this.convertContractFromOkx(data);
      default:
        throw new Error(`Unsupported source exchange: ${sourceExchange}`);
    }
  }

  // ==================== Gate.io 转换方法 ====================

  /**
   * 转换为Gate.io格式
   * Convert to Gate.io format
   * @param data 输入数据 Input data
   * @returns Gate.io格式数据 Gate.io format data
   */
  private convertToGateIo(data: any): any {
    // Gate.io作为基准格式，直接返回
    return data;
  }

  /**
   * 从Gate.io格式转换
   * Convert from Gate.io format
   * @param data Gate.io格式数据 Gate.io format data
   * @returns 统一格式数据 Unified format data
   */
  private convertFromGateIo(data: any): any {
    // Gate.io作为基准格式，直接返回
    return data;
  }

  /**
   * 从Gate.io转换账户信息
   * Convert account information from Gate.io
   * @param data Gate.io账户数据 Gate.io account data
   * @returns 统一格式的账户信息 Unified format account information
   */
  private convertAccountFromGateIo(data: any): BaseAccount {
    return {
      currency: data.currency || '',
      total: data.total || '0',
      available: data.available || '0',
      position_margin: data.position_margin || data.positionMargin || '0',
      order_margin: data.order_margin || data.orderMargin || '0',
      unrealised_pnl: data.unrealised_pnl || data.unrealisedPnl || '0',
    };
  }

  /**
   * 从Gate.io转换持仓信息
   * Convert position information from Gate.io
   * @param data Gate.io持仓数据 Gate.io position data
   * @returns 统一格式的持仓信息 Unified format position information
   */
  private convertPositionFromGateIo(data: any): BasePosition {
    return {
      contract: data.contract || '',
      size: data.size || '0',
      leverage: data.leverage || '1',
      entry_price: data.entry_price || data.entryPrice || '0',
      mark_price: data.mark_price || data.markPrice || '0',
      liq_price: data.liq_price || data.liqPrice || '0',
      unrealised_pnl: data.unrealised_pnl || data.unrealisedPnl || '0',
      realised_pnl: data.realised_pnl || data.realisedPnl || '0',
      margin: data.margin || '0',
    };
  }

  /**
   * 从Gate.io转换行情信息
   * Convert ticker information from Gate.io
   * @param data Gate.io行情数据 Gate.io ticker data
   * @returns 统一格式的行情信息 Unified format ticker information
   */
  private convertTickerFromGateIo(data: any): BaseTicker {
    return {
      contract: data.contract || '',
      last: data.last || '0',
      mark_price: data.mark_price || data.markPrice || '0',
      index_price: data.index_price || data.indexPrice || '0',
      high_24h: data.high_24h || data.high24h || '0',
      low_24h: data.low_24h || data.low24h || '0',
      volume_24h: data.volume_24h || data.volume24h || '0',
      change_percentage: data.change_percentage || data.changePercentage || '0',
    };
  }

  /**
   * 从Gate.io转换订单信息
   * Convert order information from Gate.io
   * @param data Gate.io订单数据 Gate.io order data
   * @returns 统一格式的订单信息 Unified format order information
   */
  private convertOrderFromGateIo(data: any): BaseOrder {
    return {
      id: data.id || '',
      contract: data.contract || '',
      size: data.size || '0',
      price: data.price || '0',
      tif: data.tif || 'GTC',
      isReduceOnly: data.isReduceOnly || data.reduceOnly || data.reduce_only || data.is_reduce_only || false,
      autoSize: data.autoSize || data.auto_size || '',
      stopLoss: data.stopLoss || data.stop_loss || 0,
      takeProfit: data.takeProfit || data.take_profit || 0,
      status: data.status || '',
      create_time: data.create_time || data.createTime || 0,
      update_time: data.update_time || data.updateTime || 0,
      fill_price: data.fill_price || data.fillPrice || '0',
      filled_total: data.filled_total || data.filledTotal || '0',
      fee: data.fee || '0',
      fee_currency: data.fee_currency || data.feeCurrency || '',
      left: data.left || '0',
    };
  }

  /**
   * 从Gate.io转换K线数据
   * Convert candlestick data from Gate.io
   * @param data Gate.io K线数据 Gate.io candlestick data
   * @returns 统一格式的K线数据 Unified format candlestick data
   */
  private convertCandleFromGateIo(data: any): BaseCandle {
    return {
      timestamp: data.timestamp || 0,
      volume: data.volume || '0',
      close: data.close || '0',
      high: data.high || '0',
      low: data.low || '0',
      open: data.open || '0',
    };
  }

  /**
   * 从Gate.io转换合约信息
   * Convert contract information from Gate.io
   * @param data Gate.io合约数据 Gate.io contract data
   * @returns 统一格式的合约信息 Unified format contract information
   */
  private convertContractFromGateIo(data: any): BaseContract {
    return {
      id: data.id || '',
      name: data.name || '',
      contract: data.contract || '',
      settle: data.settle || '',
      base: data.base || '',
      quote: data.quote || '',
      type: data.type || '',
      leverage_min: data.leverage_min || data.leverageMin || '1',
      leverage_max: data.leverage_max || data.leverageMax || '100',
      order_size_min: data.order_size_min || data.orderSizeMin || 0,
      order_size_max: data.order_size_max || data.orderSizeMax || 0,
      order_price_min: data.order_price_min || data.orderPriceMin || 0,
      order_price_max: data.order_price_max || data.orderPriceMax || 0,
    };
  }

  // ==================== OKX 转换方法 ====================

  /**
   * 转换为OKX格式
   * Convert to OKX format
   * @param data 输入数据 Input data
   * @returns OKX格式数据 OKX format data
   */
  private convertToOkx(data: any): any {
    // 根据数据类型转换为OKX格式
    if (Array.isArray(data)) {
      return data.map(item => this.convertToOkx(item));
    }

    // 判断数据类型并转换
    if (data.contract !== undefined) {
      // 可能是订单或持仓数据
      if (data.size !== undefined && data.price !== undefined) {
        // 订单数据
        return this.convertOrderToOkx(data);
      } else if (data.leverage !== undefined) {
        // 持仓数据
        return this.convertPositionToOkx(data);
      }
    } else if (data.last !== undefined) {
      // 行情数据
      return this.convertTickerToOkx(data);
    } else if (data.total !== undefined) {
      // 账户数据
      return this.convertAccountToOkx(data);
    } else if (data.timestamp !== undefined && data.volume !== undefined) {
      // K线数据
      return this.convertCandleToOkx(data);
    } else if (data.id !== undefined && data.name !== undefined) {
      // 合约数据
      return this.convertContractToOkx(data);
    }

    // 默认直接返回
    return data;
  }

  /**
   * 从OKX格式转换
   * Convert from OKX format
   * @param data OKX格式数据 OKX format data
   * @returns 统一格式数据 Unified format data
   */
  private convertFromOkx(data: any): any {
    // 根据数据类型转换为统一格式
    if (Array.isArray(data)) {
      return data.map(item => this.convertFromOkx(item));
    }

    // 判断数据类型并转换
    if (data.instId !== undefined) {
      // 可能是订单、持仓、行情或合约数据
      if (data.sz !== undefined && data.px !== undefined) {
        // 订单数据
        return this.convertOrderFromOkx(data);
      } else if (data.posSize !== undefined) {
        // 持仓数据
        return this.convertPositionFromOkx(data);
      } else if (data.last !== undefined) {
        // 行情数据
        return this.convertTickerFromOkx(data);
      } else if (data.ctMult !== undefined) {
        // 合约数据
        return this.convertContractFromOkx(data);
      }
    } else if (data.totalEq !== undefined) {
      // 账户数据
      return this.convertAccountFromOkx(data);
    } else if (data.ts !== undefined && data.o !== undefined) {
      // K线数据
      return this.convertCandleFromOkx(data);
    }

    // 默认直接返回
    return data;
  }

  /**
   * 从OKX转换账户信息
   * Convert account information from OKX
   * @param data OKX账户数据 OKX account data
   * @returns 统一格式的账户信息 Unified format account information
   */
  private convertAccountFromOkx(data: any): BaseAccount {
    return {
      currency: data.ccy || '',
      total: data.totalEq || '0',
      available: data.availEq || '0',
      position_margin: data.imr || '0',
      order_margin: data.ordFroz || '0',
      unrealised_pnl: data.upl || '0',
    };
  }

  /**
   * 从OKX转换持仓信息
   * Convert position information from OKX
   * @param data OKX持仓数据 OKX position data
   * @returns 统一格式的持仓信息 Unified format position information
   */
  private convertPositionFromOkx(data: any): BasePosition {
    return {
      contract: data.instId || '',
      size: data.posSize || '0',
      leverage: data.lever || '1',
      entry_price: data.avgPx || '0',
      mark_price: data.markPx || '0',
      liq_price: data.liqPx || '0',
      unrealised_pnl: data.upl || '0',
      realised_pnl: data.realisedPnl || '0',
      margin: data.margin || '0',
    };
  }

  /**
   * 从OKX转换行情信息
   * Convert ticker information from OKX
   * @param data OKX行情数据 OKX ticker data
   * @returns 统一格式的行情信息 Unified format ticker information
   */
  private convertTickerFromOkx(data: any): BaseTicker {
    return {
      contract: data.instId || '',
      last: data.last || '0',
      mark_price: data.markPx || '0',
      index_price: data.idxPx || '0',
      high_24h: data.high24h || '0',
      low_24h: data.low24h || '0',
      volume_24h: data.vol24h || '0',
      change_percentage: data.changePercentage || '0',
    };
  }

  /**
   * 从OKX转换订单信息
   * Convert order information from OKX
   * @param data OKX订单数据 OKX order data
   * @returns 统一格式的订单信息 Unified format order information
   */
  private convertOrderFromOkx(data: any): BaseOrder {
    return {
      id: data.ordId || '',
      contract: data.instId || '',
      size: parseFloat(data.sz || '0'),
      price: parseFloat(data.px || '0'),
      tif: data.tif || 'GTC',
      isReduceOnly: data.reduceOnly || false,
      autoSize: data.autoSize || '',
      stopLoss: parseFloat(data.slTriggerPx || '0'),
      takeProfit: parseFloat(data.tpTriggerPx || '0'),
      status: data.state || '',
      create_time: parseInt(data.cTime || '0'),
      update_time: parseInt(data.uTime || '0'),
      fill_price: data.avgPx || '0',
      filled_total: data.accFillSz || '0',
      fee: data.fee || '0',
      fee_currency: data.feeCcy || '',
      left: parseFloat(data.leavesSz || '0'),
    };
  }

  /**
   * 从OKX转换K线数据
   * Convert candlestick data from OKX
   * @param data OKX K线数据 OKX candlestick data
   * @returns 统一格式的K线数据 Unified format candlestick data
   */
  private convertCandleFromOkx(data: any): BaseCandle {
    return {
      timestamp: parseInt(data.ts || '0'),
      volume: data.vol || '0',
      close: data.c || '0',
      high: data.h || '0',
      low: data.l || '0',
      open: data.o || '0',
    };
  }

  /**
   * 从OKX转换合约信息
   * Convert contract information from OKX
   * @param data OKX合约数据 OKX contract data
   * @returns 统一格式的合约信息 Unified format contract information
   */
  private convertContractFromOkx(data: any): BaseContract {
    return {
      id: data.instId || '',
      name: data.alias || '',
      contract: data.instId || '',
      settle: data.settleCcy || '',
      base: data.baseCcy || '',
      quote: data.quoteCcy || '',
      type: data.instType || '',
      leverage_min: data.leverMin || '1',
      leverage_max: data.leverMax || '100',
      order_size_min: data.minSz || 0,
      order_size_max: data.maxLmtSz || 0,
      order_price_min: parseFloat(data.tickSz || '0'),
      order_price_max: 0, // OKX没有最大价格限制
    };
  }

  // ==================== 转换为OKX格式的方法 ====================

  /**
   * 转换账户信息为OKX格式
   * Convert account information to OKX format
   * @param data 统一格式账户数据 Unified format account data
   * @returns OKX格式账户数据 OKX format account data
   */
  private convertAccountToOkx(data: any): any {
    return {
      ccy: data.currency || '',
      totalEq: data.total || '0',
      availEq: data.available || '0',
      imr: data.position_margin || data.positionMargin || '0',
      ordFroz: data.order_margin || data.orderMargin || '0',
      upl: data.unrealised_pnl || data.unrealisedPnl || '0',
    };
  }

  /**
   * 转换持仓信息为OKX格式
   * Convert position information to OKX format
   * @param data 统一格式持仓数据 Unified format position data
   * @returns OKX格式持仓数据 OKX format position data
   */
  private convertPositionToOkx(data: any): any {
    return {
      instId: data.contract || '',
      posSize: data.size || '0',
      lever: data.leverage || '1',
      avgPx: data.entry_price || data.entryPrice || '0',
      markPx: data.mark_price || data.markPrice || '0',
      liqPx: data.liq_price || data.liqPrice || '0',
      upl: data.unrealised_pnl || data.unrealisedPnl || '0',
      realisedPnl: data.realised_pnl || data.realisedPnl || '0',
      margin: data.margin || '0',
    };
  }

  /**
   * 转换行情信息为OKX格式
   * Convert ticker information to OKX format
   * @param data 统一格式行情数据 Unified format ticker data
   * @returns OKX格式行情数据 OKX format ticker data
   */
  private convertTickerToOkx(data: any): any {
    return {
      instId: data.contract || '',
      last: data.last || '0',
      markPx: data.mark_price || data.markPrice || '0',
      idxPx: data.index_price || data.indexPrice || '0',
      high24h: data.high_24h || data.high24h || '0',
      low24h: data.low_24h || data.low24h || '0',
      vol24h: data.volume_24h || data.volume24h || '0',
      changePercentage: data.change_percentage || data.changePercentage || '0',
    };
  }

  /**
   * 转换订单信息为OKX格式
   * Convert order information to OKX format
   * @param data 统一格式订单数据 Unified format order data
   * @returns OKX格式订单数据 OKX format order data
   */
  private convertOrderToOkx(data: any): any {
    return {
      instId: data.contract || '',
      sz: data.size?.toString() || '0',
      px: data.price?.toString() || '0',
      tif: data.tif || 'GTC',
      reduceOnly: data.isReduceOnly || data.reduceOnly || data.reduce_only || data.is_reduce_only || false,
      autoSize: data.autoSize || data.auto_size || '',
      slTriggerPx: data.stopLoss?.toString() || '0',
      tpTriggerPx: data.takeProfit?.toString() || '0',
      state: data.status || '',
      cTime: data.create_time?.toString() || data.createTime?.toString() || '0',
      uTime: data.update_time?.toString() || data.updateTime?.toString() || '0',
      avgPx: data.fill_price || data.fillPrice || '0',
      accFillSz: data.filled_total || data.filledTotal || '0',
      fee: data.fee || '0',
      feeCcy: data.fee_currency || data.feeCurrency || '',
      leavesSz: data.left?.toString() || '0',
    };
  }

  /**
   * 转换K线数据为OKX格式
   * Convert candlestick data to OKX format
   * @param data 统一格式K线数据 Unified format candlestick data
   * @returns OKX格式K线数据 OKX format candlestick data
   */
  private convertCandleToOkx(data: any): any {
    return {
      ts: data.timestamp?.toString() || '0',
      vol: data.volume || '0',
      c: data.close || '0',
      h: data.high || '0',
      l: data.low || '0',
      o: data.open || '0',
    };
  }

  /**
   * 转换合约信息为OKX格式
   * Convert contract information to OKX format
   * @param data 统一格式合约数据 Unified format contract data
   * @returns OKX格式合约数据 OKX format contract data
   */
  private convertContractToOkx(data: any): any {
    return {
      instId: data.contract || '',
      alias: data.name || '',
      settleCcy: data.settle || '',
      baseCcy: data.base || '',
      quoteCcy: data.quote || '',
      instType: data.type || '',
      leverMin: data.leverage_min || data.leverageMin || '1',
      leverMax: data.leverage_max || data.leverageMax || '100',
      minSz: data.order_size_min || data.orderSizeMin || 0,
      maxLmtSz: data.order_size_max || data.orderSizeMax || 0,
      tickSz: data.order_price_min?.toString() || data.orderPriceMin?.toString() || '0',
    };
  }
}

// 创建单例实例
const exchangeConverter = new ExchangeConverterImpl();

/**
 * 获取交易所转换器实例
 * Get exchange converter instance
 * @returns 交易所转换器实例 Exchange converter instance
 */
export function getExchangeConverter(): ExchangeConverter {
  return exchangeConverter;
}

/**
 * 获取当前交易所类型
 * Get current exchange type
 * @returns 交易所类型 Exchange type
 */
export function getCurrentExchangeType(): ExchangeType {
  // 从环境变量获取交易所类型
  const defaultExchange = process.env.DEFAULT_EXCHANGE?.toLowerCase();
  
  switch (defaultExchange) {
    case 'gateio':
      return ExchangeType.GATEIO;
    case 'okx':
      return ExchangeType.OKX;
    default:
      // 默认使用OKX
      return ExchangeType.OKX;
  }
}

/**
 * 检查是否为当前交易所
 * Check if it's the current exchange
 * @param exchangeType 交易所类型 Exchange type
 * @returns 是否为当前交易所 Whether it's the current exchange
 */
export function isCurrentExchange(exchangeType: ExchangeType): boolean {
  return getCurrentExchangeType() === exchangeType;
}

/**
 * 转换输入数据为当前交易所格式
 * Convert input data to current exchange format
 * @param data 输入数据 Input data
 * @returns 当前交易所格式数据 Current exchange format data
 */
export function convertToCurrentExchange(data: any): any {
  const currentExchange = getCurrentExchangeType();
  return exchangeConverter.convertInput(data, currentExchange);
}

/**
 * 从当前交易所格式转换为统一格式
 * Convert from current exchange format to unified format
 * @param data 当前交易所格式数据 Current exchange format data
 * @returns 统一格式数据 Unified format data
 */
export function convertFromCurrentExchange(data: any): any {
  const currentExchange = getCurrentExchangeType();
  return exchangeConverter.convertOutput(data, currentExchange);
}

/**
 * 转换账户信息为统一格式
 * Convert account information to unified format
 * @param data 账户数据 Account data
 * @param sourceExchange 源交易所 Source exchange
 * @returns 统一格式的账户信息 Unified format account information
 */
export function convertAccount(data: any, sourceExchange?: ExchangeType): BaseAccount {
  const exchange = sourceExchange || getCurrentExchangeType();
  return exchangeConverter.convertAccount(data, exchange);
}

/**
 * 转换持仓信息为统一格式
 * Convert position information to unified format
 * @param data 持仓数据 Position data
 * @param sourceExchange 源交易所 Source exchange
 * @returns 统一格式的持仓信息 Unified format position information
 */
export function convertPosition(data: any, sourceExchange?: ExchangeType): BasePosition {
  const exchange = sourceExchange || getCurrentExchangeType();
  return exchangeConverter.convertPosition(data, exchange);
}

/**
 * 转换行情信息为统一格式
 * Convert ticker information to unified format
 * @param data 行情数据 Ticker data
 * @param sourceExchange 源交易所 Source exchange
 * @returns 统一格式的行情信息 Unified format ticker information
 */
export function convertTicker(data: any, sourceExchange?: ExchangeType): BaseTicker {
  const exchange = sourceExchange || getCurrentExchangeType();
  return exchangeConverter.convertTicker(data, exchange);
}

/**
 * 转换订单信息为统一格式
 * Convert order information to unified format
 * @param data 订单数据 Order data
 * @param sourceExchange 源交易所 Source exchange
 * @returns 统一格式的订单信息 Unified format order information
 */
export function convertOrder(data: any, sourceExchange?: ExchangeType): BaseOrder {
  const exchange = sourceExchange || getCurrentExchangeType();
  return exchangeConverter.convertOrder(data, exchange);
}

/**
 * 转换K线数据为统一格式
 * Convert candlestick data to unified format
 * @param data K线数据 Candlestick data
 * @param sourceExchange 源交易所 Source exchange
 * @returns 统一格式的K线数据 Unified format candlestick data
 */
export function convertCandle(data: any, sourceExchange?: ExchangeType): BaseCandle {
  const exchange = sourceExchange || getCurrentExchangeType();
  return exchangeConverter.convertCandle(data, exchange);
}

/**
 * 转换合约信息为统一格式
 * Convert contract information to unified format
 * @param data 合约数据 Contract data
 * @param sourceExchange 源交易所 Source exchange
 * @returns 统一格式的合约信息 Unified format contract information
 */
export function convertContract(data: any, sourceExchange?: ExchangeType): BaseContract {
  const exchange = sourceExchange || getCurrentExchangeType();
  return exchangeConverter.convertContract(data, exchange);
}

export default exchangeConverter;