
# Close existing PowerPoint
Stop-Process -Name "powerpnt" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$ppt = New-Object -ComObject PowerPoint.Application
$ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$pres = $ppt.Presentations.Add()

function Add-Slide($title, $text, $imagePath) {
    $layout = if ($text -eq "" -and $imagePath -eq "") { 1 } else { 2 }
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, $layout)
    
    if ($slide.Shapes.HasTitle) {
        $slide.Shapes.Title.TextFrame.TextRange.Text = $title
    }

    if ($text -ne "") {
        try {
            $slide.Shapes.Item(2).TextFrame.TextRange.Text = $text
        } catch {
            foreach ($shape in $slide.Shapes) {
                if ($shape.Name -like "*Content*" -or $shape.Name -like "*Body*") {
                    $shape.TextFrame.TextRange.Text = $text
                    break
                }
            }
        }
    }

    if ($imagePath -ne "" -and (Test-Path $imagePath)) {
        $top = if ($text -eq "") { 100 } else { 250 }
        $left = 50
        $width = 620
        $height = 350
        $slide.Shapes.AddPicture($imagePath, $false, $true, $left, $top, $width, $height)
    }
}

# Slide 1: Cover
Add-Slide "Logística Farma IA" "" ""
$slide1 = $pres.Slides.Item(1)
$slide1.Shapes.Item(1).TextFrame.TextRange.Text = "Logística Farma IA"
$slide1.Shapes.AddTextbox(1, 100, 300, 520, 50).TextFrame.TextRange.Text = "Gestão Inteligente de Estoque Hospitalar e Farmacêutico"

# Slides
Add-Slide "Finalidade do Aplicativo" "O Logística Farma é uma solução para transformar dados logísticos brutos em inteligência operacional. Objetivos: Redução de Perdas (FEFO), Eficiência Operacional, Visibilidade 360º e Segurança do Paciente." ""
Add-Slide "Insights do Farma" "Coração analítico do sistema: Giro de estoque, Rupturas Atuais, Heatmap de Validade e Dicas IA Gemini." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\insights_farma.png"
Add-Slide "Indicadores Logísticos V2" "Visão profunda sobre a performance logístia e financeira: Acuracidade, Movimentação Financeira e Análise de Pico." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\indicadores_logisticos.png"
Add-Slide "Painel CAF V2" "Gestão integrada: Cruzamento de dados de Consumo, Saldo e OC. Sugestão de Compras e Status de Itens." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\painel_caf_v2.png"
Add-Slide "Pedido 24h & Ressuprimento" "Agilidade no abastecimento: Automação baseada no consumo real, Saldos Hospitalares e Ressuprimento Inteligente." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\pedido_24h.png"
Add-Slide "Rastreio de Falta e Segurança" "Monitoramento proativo: Dashboard de Ruptura, Dias de Cobertura e Análise de Tendências." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\rastreio_falta.png"
Add-Slide "Conclusão" "Ferramenta de tomada de decisão que elimina trabalho manual, garante sustentabilidade financeira e excelência assistencial." ""

$basePath = "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\Apresentacao_Logistica_Farma"

# Save PPTX
$pptxPath = $basePath + ".pptx"
$pres.SaveAs($pptxPath)

# Export to PDF (32 = ppSaveAsPDF)
$pdfPath = $basePath + ".pdf"
$pres.SaveAs($pdfPath, 32)

$pres.Close()
$ppt.Quit()

Write-Host "Success: Created $pptxPath and $pdfPath"
