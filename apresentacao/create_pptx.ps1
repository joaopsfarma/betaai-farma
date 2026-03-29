
$ppt = New-Object -ComObject PowerPoint.Application
$ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$pres = $ppt.Presentations.Add()

function Add-Slide($title, $text, $imagePath) {
    # Layout 2 is Title and Content
    # Layout 1 is Title Slide
    $layout = if ($text -eq "" -and $imagePath -eq "") { 1 } else { 2 }
    $slide = $pres.Slides.Add($pres.Slides.Count + 1, $layout)
    
    # Set Title
    if ($slide.Shapes.HasTitle) {
        $slide.Shapes.Title.TextFrame.TextRange.Text = $title
    }

    # Add Text if provided
    if ($text -ne "") {
        # Shape 2 is usually the content placeholder
        $slide.Shapes.Item(2).TextFrame.TextRange.Text = $text
    }

    # Add Image if provided
    if ($imagePath -ne "" -and (Test-Path $imagePath)) {
        # Calculate positions
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

# Slide 2: Finalidade
Add-Slide "Finalidade do Aplicativo" "O Logística Farma é uma solução para transformar dados logísticos brutos em inteligência operacional. Objetivos: Redução de Perdas (FEFO), Eficiência Operacional, Visibilidade 360º e Segurança do Paciente." ""

# Slide 3: Insights do Farma
Add-Slide "Insights do Farma" "Coração analítico do sistema: Giro de estoque, Rupturas Atuais, Heatmap de Validade e Dicas IA Gemini." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\insights_farma.png"

# Slide 4: Indicadores Logísticos V2
Add-Slide "Indicadores Logísticos V2" "Visão profunda sobre a performance logístia e financeira: Acuracidade, Movimentação Financeira e Análise de Pico." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\indicadores_logisticos.png"

# Slide 5: Painel CAF V2
Add-Slide "Painel CAF V2" "Gestão integrada: Cruzamento de dados de Consumo, Saldo e OC. Sugestão de Compras e Status de Itens." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\painel_caf_v2.png"

# Slide 6: Pedido 24h
Add-Slide "Pedido 24h & Ressuprimento" "Agilidade no abastecimento: Automação baseada no consumo real, Saldos Hospitalares e Ressuprimento Inteligente." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\pedido_24h.png"

# Slide 7: Rastreio de Falta
Add-Slide "Rastreio de Falta e Segurança" "Monitoramento proativo: Dashboard de Ruptura, Dias de Cobertura e Análise de Tendências." "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\rastreio_falta.png"

# Slide 8: Conclusão
Add-Slide "Conclusão" "Ferramenta de tomada de decisão que elimina trabalho manual, garante sustentabilidade financeira e excelência assistencial." ""

# Save and Close
$savePath = "C:\Users\Admin\Desktop\Projeto Claude\apresentacao\Apresentacao_Logistica_Farma.pptx"
if (Test-Path $savePath) { Remove-Item $savePath }
$pres.SaveAs($savePath)
# $pres.Close()
# $ppt.Quit()

Write-Host "PowerPoint presentation created successfully at $savePath"
