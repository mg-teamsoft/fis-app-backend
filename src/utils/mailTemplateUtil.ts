export function generateMjmlTemplate(verificationUrl: string): string {
  return `
  <mjml>
    <mj-body background-color="#f0f0f0">
      <mj-section>
        <mj-column>
          <mj-text font-size="20px" font-weight="bold" color="#333333">My Fiş App - E-posta Doğrulama</mj-text>
          <mj-divider border-color="#cccccc" />
          <mj-text font-size="16px" color="#555555">
            My Fiş App uygulaması hesabınızı doğrulamak için aşağıdaki bağlantıya 24 saat içinde tıklayın:
          </mj-text>
          <mj-button background-color="#007BFF" color="white" href="${verificationUrl}">
            E-postayı Doğrula
          </mj-button>
          <mj-text font-size="12px" color="#999999">
            Bu e-posta size yanlışlıkla geldiyse lütfen dikkate almayın.
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
}

export function generateWelcomeMjmlTemplate(userName: string): string {
  return `
  <mjml>
    <mj-body background-color="#ffffff">
      <mj-section background-color="#007BFF" padding="20px">
        <mj-column>
          <mj-text align="center" font-size="24px" color="#ffffff" font-weight="bold">
            Hoş Geldin, ${userName || 'Kullanıcı'}!
          </mj-text>
        </mj-column>
      </mj-section>

      <mj-section padding="20px">
        <mj-column>
          <mj-text font-size="16px" color="#333333">
            My Fiş App'e katıldığınız için çok mutluyuz.
          </mj-text>

          <mj-text font-size="14px" color="#555555">
            Artık fişlerinizi kolayca dijitalleştirebilir, harcamalarınızı takip edebilir ve analiz edebilirsiniz.
          </mj-text>

          <mj-button background-color="#007BFF" color="#ffffff" href="https://myfisapp.com">
            Uygulamayı Aç
          </mj-button>

          <mj-text font-size="12px" color="#999999">
            Yardıma ihtiyacınız olursa bizimle iletişime geçmekten çekinmeyin. 
          </mj-text>
          <mj-text font-size="12px" color="#999999" font-weight="bold">
						Destek ekibimizin mail adresi: support@myfisapp.com          
					</mj-text>
        </mj-column>
      </mj-section>

      <mj-section background-color="#f0f0f0" padding="10px">
        <mj-column>
          <mj-text align="center" font-size="12px" color="#999999">
            My Fiş App © ${new Date().getFullYear()} | Tüm Hakları Saklıdır
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
}

export function generatePasswordResetTemplate(resetUrl: string): string {
  return `
  <mjml>
    <mj-body background-color="#f0f0f0">
      <mj-section>
        <mj-column>
          <mj-text font-size="20px" font-weight="bold" color="#333333">My Fiş App - Şifre Sıfırlama</mj-text>
          <mj-divider border-color="#cccccc" />
          <mj-text font-size="16px" color="#555555">
            Şifrenizi sıfırlamak için aşağıdaki bağlantıya 1 saat içinde tıklayın:
          </mj-text>
          <mj-button background-color="#FF6B35" color="white" href="${resetUrl}">
            Şifreyi Sıfırla
          </mj-button>
          <mj-text font-size="12px" color="#999999">
            Bu isteği siz yapmadıysanız lütfen bu e-postayı yok sayın.
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
  `;
}
