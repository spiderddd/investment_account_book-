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
              1. 设计理念与数据存储
            </h3>
            <p className="leading-relaxed mb-4">
              <strong>InvestTrack</strong> 是一个纯前端应用。为了方便未来的数据迁移（如迁移到后端数据库）和保障数据隐私，
              本项目采用<strong>“JSON 文件存储”</strong>作为核心数据交换格式。
            </p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-4">
              <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                <FileJson size={18} />
                如何管理数据文件？
              </h4>
              <p className="text-sm text-blue-800 mb-2">
                虽然为了操作流畅，浏览器会临时缓存您的数据，但<strong>JSON 文件才是您的“硬盘”</strong>。
              </p>
              <ul className="list-disc pl-5 text-sm text-blue-800 space-y-1">
                <li>点击右上角的 <strong>数据库图标</strong> 打开数据管理面板。</li>
                <li>定期点击 <strong>“导出数据”</strong> 将最新的投资记录保存为 <code>.json</code> 文件到您的电脑/手机。</li>
                <li>更换设备或清理浏览器缓存后，使用 <strong>“导入数据”</strong> 加载之前的 JSON 文件即可恢复所有记录。</li>
              </ul>
            </div>
          </section>

          {/* Section 2: Core Logic */}
          <section>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Calculator className="text-emerald-500" />
              2. 核心数据逻辑
            </h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-2">A. 股票/基金 (策略资产)</h4>
                <div className="space-y-3 text-sm">
                  <p><strong>逻辑核心：</strong>份额累积制</p>
                  <div className="bg-slate-50 p-2 rounded text-xs font-mono text-slate-600">
                    本月总份额 = 上月总份额 + 本月新增份额<br/>
                    本月市值 = 本月总份额 × 当前单价
                  </div>
                  <p>录入时，您只需输入本月的<strong>变动量</strong>（新增投入、新增份额）和<strong>当前单价</strong>。</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="font-bold text-slate-800 mb-2 border-b pb-2">B. 黄金/定存 (其他资产)</h4>
                <div className="space-y-3 text-sm">
                  <p><strong>逻辑核心：</strong>状态快照制 (State Snapshot)</p>
                  <p>这些资产不记录流水，只记录<strong>每个月月底的总状态</strong>。系统会自动复制上个月的数据作为本月的起点。</p>
                  <div className="mt-3 bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm">
                    <p className="font-bold text-amber-800 flex items-center gap-1">
                      <ArrowRightCircle size={16} />
                      常见问题：3月买了黄金，7月又买了，怎么记？
                    </p>
                    <ol className="list-decimal pl-5 mt-1 space-y-1 text-amber-900">
                      <li>切换到 7 月份 (System 自动复制 3 月的 50g)。</li>
                      <li>点击 黄金 的<strong>编辑</strong>按钮。</li>
                      <li>将“当前总持有量”修改为 <strong>60</strong> (50g旧 + 10g新)。</li>
                      <li>保存即可。系统只关心“7月底你总共有多少”。</li>
                    </ol>
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
                <h4 className="font-bold text-slate-900 text-lg">登记其他资产 (Total Assets)</h4>
                <p className="mt-1 text-slate-600">
                  前往“总资产”页面，添加您的定期存款、实物黄金或稳健理财。
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[41px] top-0 bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">4</span>
                <h4 className="font-bold text-slate-900 text-lg">数据备份 (Data)</h4>
                <p className="mt-1 text-slate-600">
                  点击顶部的数据库图标，选择 <strong>导出</strong>。请妥善保存该 JSON 文件，它是您数据的唯一永久备份。
                </p>
              </div>
            </div>
          </section>

           {/* Section 4: Data Structure */}
           <section>
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Database className="text-amber-500" />
              4. 数据结构参考
            </h3>
            <p className="text-sm text-slate-600 mb-2">导出的 JSON 文件将包含以下完整结构，可直接用于后续迁移到数据库系统。</p>
            <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-xs overflow-x-auto">
              <pre>{`{
  "version": "1.0",
  "exportedAt": "2023-10-27T10:00:00Z",
  "strategies": [ ... ],
  "snapshots": [
    {
      "date": "2023-12",
      "holdings": [ ... ],
      "otherAssets": [ ... ]
    }
  ]
}`}</pre>
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