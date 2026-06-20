import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

export const initMailer = async () => {
  try {
    // Generate a free test account from Ethereal Mail
    const testAccount = await nodemailer.createTestAccount();
    
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });

    console.log('[Mailer] Ethereal SMTP Ready. Account:', testAccount.user);
  } catch (error) {
    console.error('[Mailer] Failed to initialize Ethereal SMTP', error);
  }
};

export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
  if (!transporter) {
    console.error('[Mailer] Transporter not initialized');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: '"Nexus Platform" <noreply@nexus-meetings.app>',
      to,
      subject,
      text,
      html,
    });


    return info;
  } catch (error) {
    console.error('[Mailer] Failed to send email', error);
  }
};
