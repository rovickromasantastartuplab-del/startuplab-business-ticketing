
import React from 'react';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h2 className="text-lg font-bold text-[#2E2E2F] tracking-tight">{title}</h2>
    <div className="text-sm font-medium text-[#2E2E2F]/70 leading-relaxed space-y-3">{children}</div>
  </div>
);

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
      <div className="mb-12">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#38BDF2] mb-3">Legal</p>
        <h1 className="text-3xl lg:text-4xl font-black text-[#2E2E2F] tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#2E2E2F]/50">Last updated: 16 August 2026</p>
      </div>

      <div className="space-y-10">
        <Section title="1. Introduction">
          <p>
            This Privacy Policy explains how StartupLab Business Center ("we", "us", "our") collects, uses, and
            protects personal information when you use our event ticketing platform (the "Platform") to browse
            events, register for events, or purchase tickets.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <p>When you register for an event or create an account, we may collect:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Contact details, such as your name, email address, and phone number</li>
            <li>Registration details, such as your company/organization and any notes submitted with your ticket</li>
            <li>Payment-related information for paid events, processed through our third-party payment gateway (we do not store full card numbers)</li>
            <li>Attendance and check-in records, including ticket status and check-in timestamps</li>
            <li>Technical information, such as basic browser/device data collected automatically when you use the Platform</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Process your event registration and issue your ticket</li>
            <li>Process payments for paid events through our payment gateway</li>
            <li>Send you registration confirmations, tickets, and event-related updates</li>
            <li>Check you in at the event venue using your ticket's QR code</li>
            <li>Maintain records for administrative, reporting, and security purposes</li>
            <li>Improve the Platform and the events we host</li>
          </ul>
        </Section>

        <Section title="4. How We Share Your Information">
          <p>
            We do not sell your personal information. We may share your information with:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Our payment gateway provider, solely to process payments for paid tickets</li>
            <li>Event organizers and staff, to manage registrations, check-in, and attendee communications for the specific event you registered for</li>
            <li>Service providers who help us operate the Platform (such as hosting and database providers), under confidentiality obligations</li>
            <li>Authorities, where required to comply with applicable law or to protect our rights, users, or the public</li>
          </ul>
        </Section>

        <Section title="5. Data Retention">
          <p>
            We retain your registration and ticketing information for as long as necessary to fulfill the
            purposes described in this Policy, including recordkeeping for event history, financial reporting,
            and legal compliance. You may request deletion of your account information as described in Section 7
            below, subject to any records we are required to retain by law.
          </p>
        </Section>

        <Section title="6. Data Security">
          <p>
            We apply reasonable technical and organizational measures to protect your personal information from
            unauthorized access, loss, misuse, or alteration. However, no method of transmission or storage is
            completely secure, and we cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="7. Your Rights & Choices">
          <p>
            Depending on your location, you may have rights to access, correct, or request deletion of your
            personal information, or to object to certain uses of it. To exercise these rights, please contact us
            using the details in Section 9 below. We will respond to reasonable requests within a reasonable
            timeframe, subject to applicable law.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            We use essential cookies to keep you signed in and to support core functionality of the Platform, such
            as authenticated sessions for event organizers and staff. We do not use cookies for third-party
            advertising.
          </p>
        </Section>

        <Section title="9. Contact Us">
          <p>
            If you have questions about this Privacy Policy or how your information is handled, please contact
            the StartupLab Business Center team through the event organizer contact details provided on the
            relevant event page.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices or for legal,
            operational, or regulatory reasons. The "Last updated" date above indicates when this Policy was last
            revised.
          </p>
        </Section>
      </div>
    </div>
  );
};
