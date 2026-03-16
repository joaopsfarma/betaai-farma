import React, { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import Papa from 'papaparse';

export interface DailyConsumptionData {
  id: string;
  averageConsumption: number;
  currentStock: number;
}

interface DailyConsumptionCsvUploaderProps {
  onDataLoaded: (data: Map<string, DailyConsumptionData>) => void;
  title?: string;
}

export const DailyConsumptionCsvUploader: React.FC<DailyConsumptionCsvUploaderProps> = ({ onDataLoaded, title }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setSuccess(false);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      encoding: 'ISO-8859-1', // Common encoding for Brazilian CSV exports
      complete: (results) => {
        try {
          const consumptionMap = new Map<string, DailyConsumptionData>();
          let data = results.data as string[][];
          
          // Handle weird CSV format where the entire row is wrapped in quotes
          data = data.map(row => {
            if (row.length === 1 && typeof row[0] === 'string' && row[0].includes(',')) {
              const parsedRow = Papa.parse(row[0], { header: false }).data[0] as string[];
              if (parsedRow && parsedRow.length > 1) {
                return parsedRow;
              }
            }
            return row;
          });
          
          let count = 0;
          
          // Find the header row
          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(20, data.length); i++) {
            const row = data[i];
            const prodIdx = row.findIndex(c => c && c.trim().toLowerCase() === 'produto');
            const mediaIdx = row.findIndex(c => {
              if (!c) return false;
              const n = c.trim().toLowerCase();
              return n.includes('mdi') || n.includes('medi') || n.includes('méd') || 
                     (n.includes('m') && n.includes('dia')) || n.includes('dia');
            });
            const saldoIdx = row.findIndex(c => c && c.trim().toLowerCase() === 'saldo');
            
            if (prodIdx !== -1 && mediaIdx !== -1 && saldoIdx !== -1) {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) {
             throw new Error('Cabeçalhos não encontrados. Verifique se o arquivo contém as colunas: Produto, Média e Saldo.');
          }

          const headerRow = data[headerRowIndex];
          const idColIdx = headerRow.findIndex(c => c && c.trim().toLowerCase() === 'produto');
          const mediaColIdx = headerRow.findIndex(c => {
            if (!c) return false;
            const n = c.trim().toLowerCase();
            return n.includes('mdi') || n.includes('medi') || n.includes('méd') || 
                   (n.includes('m') && n.includes('dia')) || n.includes('dia');
          });
          const saldoColIdx = headerRow.findIndex(c => c && c.trim().toLowerCase() === 'saldo');

          for (let i = headerRowIndex + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < Math.max(idColIdx, mediaColIdx, saldoColIdx)) continue;

            const idRaw = row[idColIdx];
            const mediaRaw = row[mediaColIdx];
            const saldoRaw = row[saldoColIdx];

            if (!idRaw || idRaw.trim() === '' || isNaN(Number(idRaw.trim()))) continue;

            const id = idRaw.trim();
            
            let averageConsumption = 0;
            if (mediaRaw) {
              // Handle formats like "8,667" or "10.5"
              // Dividing by 5 as per user request: "com base no consumo de 5 dias"
              averageConsumption = parseFloat(mediaRaw.replace(/\./g, '').replace(',', '.')) / 5;
            }

            let currentStock = 0;
            if (saldoRaw) {
              currentStock = parseFloat(saldoRaw.replace(/\./g, '').replace(',', '.'));
            }

            if (id && !isNaN(averageConsumption) && !isNaN(currentStock)) {
               consumptionMap.set(id, { id, averageConsumption, currentStock });
               count++;
            }
          }

          if (count === 0) {
            throw new Error('Nenhum dado válido encontrado. Verifique o layout do arquivo.');
          }

          onDataLoaded(consumptionMap);
          setSuccess(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
          console.error(err);
        }
      },
      error: (err) => {
        setError(`Erro na leitura do CSV: ${err.message}`);
      }
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5 text-indigo-600" />
        {title || 'Importar Consumo Diário (CSV)'}
      </h3>
      
      <div className="flex flex-col gap-4">
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer"
             onClick={() => fileInputRef.current?.click()}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.txt"
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-8 h-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">
              {fileName || 'Clique para selecionar o arquivo de Consumo Diário'}
            </span>
            <span className="text-xs text-slate-400">
              Formatos aceitos: .csv (Separado por vírgula)
            </span>
            <p className="text-xs text-slate-400 mt-2">
              Espera-se colunas: Produto (ID), Consumo (5 dias), Saldo
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 p-3 rounded-lg">
            <CheckCircle className="w-4 h-4" />
            Arquivo processado com sucesso!
          </div>
        )}
      </div>
    </div>
  );
};
