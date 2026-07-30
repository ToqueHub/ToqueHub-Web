import { Injectable, Logger } from '@nestjs/common';
import { Bonjour, Service } from 'bonjour-service';
import type { DiscoveryTxtRecords } from './discovery.types';

interface PublishOptions {
  name: string;
  port: number;
  host?: string;
  txt: DiscoveryTxtRecords;
}

@Injectable()
export class MdnsPublisher {
  private readonly logger = new Logger(MdnsPublisher.name);
  private bonjour?: Bonjour;
  private service?: Service;

  publish(options: PublishOptions) {
    this.stop();

    this.bonjour = new Bonjour(undefined, (error: Error) => {
      this.logger.warn(`Erreur mDNS: ${error.message}`);
    });

    this.service = this.bonjour.publish({
      name: options.name,
      type: 'toquehub',
      protocol: 'tcp',
      port: options.port,
      host: options.host,
      txt: options.txt,
      // The instance id makes this name unique. Skipping the library probe also
      // prevents stale records from a hot restart being reported as conflicts.
      probe: false,
    });

    this.service.on('up', () => {
      this.logger.log(`Service mDNS publie: ${options.name}._toquehub._tcp.local:${options.port}`);
    });

    this.service.on('error', (error: Error) => {
      this.logger.warn(`Publication mDNS impossible: ${error.message}`);
    });
  }

  stop() {
    if (this.service?.published) {
      this.service.stop();
    }
    this.service = undefined;

    if (this.bonjour) {
      this.bonjour.destroy();
    }
    this.bonjour = undefined;
  }
}
