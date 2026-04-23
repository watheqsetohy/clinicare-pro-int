import { useState } from "react";
import { FileText, Image as ImageIcon, Upload, Search, Filter, Download, Eye, Link } from "lucide-react";
import { cn } from "@/src/lib/utils";

const mockReports = [
  { id: "R1", type: "PDF", title: "Discharge Summary", date: "2023-10-12", source: "HIS", size: "2.4 MB" },
  { id: "R2", type: "Image", title: "Chest X-Ray", date: "2023-09-05", source: "External", size: "5.1 MB" },
  { id: "R3", type: "PDF", title: "Cardiology Consult", date: "2023-06-20", source: "HIS", size: "1.1 MB" },
];

export function SectionDReports() {
  const [activeFilter, setActiveFilter] = useState("All");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Images & Reports</h2>
          <p className="text-sm text-slate-500">Central hub for imaging and documents</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            Import from HIS
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shadow-sm">
            <Upload className="w-4 h-4" />
            Upload External
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex gap-2">
          {["All", "Imaging", "PDF", "Attachments"].map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeFilter === filter 
                  ? "bg-slate-800 text-white" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search reports..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-sm"
          />
        </div>
      </div>

      {/* Gallery/List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockReports.map(report => (
          <div key={report.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group hover:shadow-md transition-shadow flex flex-col">
            
            {/* Preview Area */}
            <div className="h-40 bg-slate-100 border-b border-slate-200 flex items-center justify-center relative overflow-hidden">
              {report.type === "PDF" ? (
                <FileText className="w-16 h-16 text-slate-300" />
              ) : (
                <ImageIcon className="w-16 h-16 text-slate-300" />
              )}
              
              {/* Overlay Actions */}
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-800 hover:scale-110 transition-transform shadow-lg" title="View">
                  <Eye className="w-5 h-5" />
                </button>
                <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-800 hover:scale-110 transition-transform shadow-lg" title="Link to Med/Condition">
                  <Link className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-900 truncate pr-2" title={report.title}>{report.title}</h3>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0",
                  report.type === "PDF" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                )}>
                  {report.type}
                </span>
              </div>
              
              <div className="text-sm text-slate-500 space-y-1 mt-auto">
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span className="font-medium text-slate-700">{report.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Source:</span>
                  <span className="font-medium text-slate-700">{report.source}</span>
                </div>
                <div className="flex justify-between">
                  <span>Size:</span>
                  <span className="font-medium text-slate-700">{report.size}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
