import React from 'react';
import { X, BookOpen, Database, Calculator, Workflow, Layers, FileJson, ArrowRightCircle } from 'lucide-react';

interface ProjectGuideProps {
  onClose: () => void;
}

export const ProjectGuide: React.FC<ProjectGuideProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 overflow-y-auto flex justify-center">
      <div className="w-full max-w-4xl bg-white min-h-screen md:min-h-0 md:my-8 md:rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="sticky top-0 bg-white/90 backdrop-blur border-b border-slate-100 p-6 flex justify-between items-center rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <BookOpen size={24} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">InvestTrack 使用手册</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-10 space-y-10 text-slate-700">
          
          {/* Section 1: Introduction */}
          <section>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Layers className="text-blue-500" />
              1. 核心逻辑：流水累积制 (Uniform Flow)
            </h3>
            <p className="leading-relaxed mb-4">
              为了准确计算所有资产的“成本”与“盈亏”，本系统摒弃了单纯修改总数的快照逻辑，转而采用统一的<strong>“进出流水制”</strong>。
              无论是买卖股票，还是银行存取款，我们都将其视为一笔“交易”。
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-4">
               <h4 className="font-bold text-blue-900 mb-2">通用公式</h4>
               <div className="font-mono text-sm bg-white p-3 rounded border border-blue-100 text-slate-600 space-y-2">
                 <p>期末持有量 = 期初持有 + 本期变动 (Quantity Change)</p>
                 <p>期末总成本 = 期初成本 + 本期净投入 (Principal Change)</p>
               </div>
            </div>
          </section>

          {/* Section 2: Core Logic */}
          <section>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Calculator className="text-emerald-500" />
              2. 不同资产的记账方式
            </h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-2">A. 证券/基金/黄金 (波动资产)</h4>
                <div className="space-y-3 text-sm">
                  <p>此类资产既有份额变化，也有价格波动。</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li><strong>本月变动(份额)</strong>：买入填正数，卖出填负数。</li>
                    <li><strong>本月流水(本金)</strong>：买入花了多少钱(正)，卖出拿回多少钱(负)。</li>
                    <li><strong>当前单价</strong>：月底收盘价。</li>
                  </ul>
                  <p className="text-xs text-slate-400 mt-2">系统会自动根据单价更新最新市值。</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-2">B. 银行理财/存款 (稳健资产)</h4>
                <div className="space-y-3 text-sm">
                  <p>此类资产通常单价恒定为 1.00。</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li><strong>存入本金</strong>：在“本月流水”填入金额（如 +10000），系统会自动同步增加持有份额。</li>
                    <li><strong>获得利息</strong>：仅修改“本月变动”增加金额（如 +50），保持“本月流水”为 0。这意味着你的钱变多了，但没有投入新本金 = <strong>盈利</strong>。</li>
                  </ul>
                  <div className="bg-emerald-50 text-emerald-800 p-2 rounded text-xs mt-2">
                    💡 提示：系统会自动计算并显示这种操作下的“利息/收益”。
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Usage Workflow */}
          <section>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Workflow className="text-purple-500" />
              3. 使用流程指南
            </h3>
            
            <div className="relative border-l-2 border-slate-200 pl-8 ml-4 space-y-8">
              <div className="relative">
                <span className="absolute -left-[41px] top-0 bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">1</span>
                <h4 className="font-bold text-slate-900 text-lg">初始化策略 (Strategy)</h4>
                <p className="mt-1 text-slate-600">
                  在“策略”页面，定义您的理想投资组合。例如：沪深300 (40%) + 纳斯达克 (30%) + 债券 (30%)。
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[41px] top-0 bg-slate-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">2</span>
                <h4 className="font-bold text-slate-900 text-lg">记录首月快照 (Snapshots)</h4>
                <p className="mt-1 text-slate-600">
                  前往“快照”页面，点击“记录本月”。输入各项资产当前的<strong>单价</strong>。
                  如果是第一次使用，请在“本月新增份额”中填入您目前的<strong>总份额</strong>，在“本月投入”中填入<strong>总成本</strong>。
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[41px] top-0 bg-slate-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">3</span>
                <h4 className="font-bold text-slate-900 text-lg">复盘与再平衡</h4>
                <p className="mt-1 text-slate-600">
                  每月记录后，回到仪表盘查看“策略偏离度”。如果某类资产（如美股）涨幅过大导致比例超标，可考虑在下个月卖出部分盈利，买入低估资产，实现“高抛低吸”。
                </p>
              </div>
            </div>
          </section>

        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl text-center">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            我已了解
          </button>
        </div>
      </div>
    </div>
  );
};